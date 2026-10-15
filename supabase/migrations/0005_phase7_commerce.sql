-- Phase 7: coupons, bundles, prepaid subscription periods, manual payments.
alter table bundles add column if not exists period_days int check (period_days is null or period_days between 1 and 3650);
alter table orders add column if not exists review_note text;
create unique index if not exists subscriptions_user_plan on subscriptions (user_id, plan);
create unique index if not exists orders_one_open_bundle on orders (user_id, bundle_id, method)
  where status in ('pending', 'awaiting_review') and bundle_id is not null;

-- ---------- Fulfillment (single path for online AND manual). Handles courses, bundles, prepaid subscription periods ----------
create or replace function fulfill_order(p_order uuid, p_source enroll_source) returns boolean
language plpgsql security definer set search_path = public as $$
declare o orders; b bundles; c courses; cid uuid; sub_id uuid; period_end timestamptz; src enroll_source; exp timestamptz;
begin
  select * into o from orders where id = p_order for update;
  if not found then raise exception 'order not found'; end if;
  if o.fulfilled_at is not null then return false; end if;       -- already fulfilled: no-op
  if o.status <> 'paid' then raise exception 'order not paid'; end if;
  src := p_source;
  if o.bundle_id is not null then
    select * into b from bundles where id = o.bundle_id;
    src := 'bundle';
    if b.period_days is not null then                              -- prepaid period; renewing = buying again (extends)
      insert into subscriptions (user_id, plan, status, current_period_end)
      values (o.user_id, b.id::text, 'active', now() + make_interval(days => b.period_days))
      on conflict (user_id, plan) do update
        set status = 'active', current_period_end = greatest(subscriptions.current_period_end, now()) + make_interval(days => b.period_days)
      returning id, current_period_end into sub_id, period_end;
      src := 'subscription';
    end if;
  end if;
  for cid in
    select o.course_id where o.course_id is not null
    union select bc.course_id from bundle_courses bc where bc.bundle_id = o.bundle_id
  loop
    select * into c from courses where id = cid;
    exp := case when sub_id is not null then period_end
                when c.access_days is null then null
                else now() + make_interval(days => c.access_days) end;
    insert into enrollments (user_id, course_id, source, order_id, subscription_id, expires_at)
    values (o.user_id, cid, src, o.id, sub_id, exp)
    on conflict (user_id, course_id) do update set
      revoked_at = null, order_id = excluded.order_id, source = excluded.source,
      subscription_id = coalesce(excluded.subscription_id, enrollments.subscription_id),
      expires_at = case when enrollments.revoked_at is not null then excluded.expires_at
                        when enrollments.expires_at is null then null          -- never downgrade lifetime access
                        when excluded.expires_at is null then null
                        else greatest(enrollments.expires_at, excluded.expires_at) end;
  end loop;
  update orders set fulfilled_at = now() where id = p_order;
  insert into audit_logs (actor_id, action, entity, entity_id) values (auth.uid(), 'order_fulfilled', 'order', p_order::text);
  return true;
end $$;
revoke all on function fulfill_order(uuid, enroll_source) from public, anon, authenticated;

-- ---------- Pricing: ONE place computes price + coupon for previews and for real orders ----------
create or replace function price_item(p_course uuid, p_bundle uuid, p_coupon text, p_user uuid, p_lock boolean default false)
returns table (subtotal int, discount int, total int, currency char(3), coupon_id uuid, err text)
language plpgsql security definer set search_path = public as $$
declare c courses; b bundles; cp coupons; v_sub int; v_cur char(3); d int := 0; used int; code text := upper(trim(coalesce(p_coupon, '')));
begin
  if (p_course is null) = (p_bundle is null) then return query select 0, 0, 0, 'EGP'::char(3), null::uuid, 'unavailable'::text; return; end if;
  if p_course is not null then
    select * into c from courses where id = p_course and status = 'published' and enrollment_open and not is_free;
    if not found then return query select 0, 0, 0, 'EGP'::char(3), null::uuid, 'unavailable'::text; return; end if;
    v_sub := coalesce(c.promo_price_minor, c.price_minor); v_cur := c.currency;
  else
    select * into b from bundles where id = p_bundle and status = 'published';
    if not found or not exists (select 1 from bundle_courses where bundle_id = p_bundle) then
      return query select 0, 0, 0, 'EGP'::char(3), null::uuid, 'unavailable'::text; return; end if;
    v_sub := b.price_minor; v_cur := b.currency;
  end if;
  if code = '' then return query select v_sub, 0, v_sub, v_cur, null::uuid, null::text; return; end if;

  if p_lock then select * into cp from coupons where upper(coupons.code) = code for update;
  else select * into cp from coupons where upper(coupons.code) = code; end if;
  if not found or not cp.active or (cp.expires_at is not null and cp.expires_at <= now())
     or not ((cp.course_id is null and cp.bundle_id is null) or cp.course_id = p_course or cp.bundle_id = p_bundle) then
    return query select v_sub, 0, v_sub, v_cur, null::uuid, 'coupon_invalid'::text; return; end if;
  if exists (select 1 from orders o where o.coupon_id = cp.id and o.user_id = p_user and o.status in ('awaiting_review', 'paid')) then
    return query select v_sub, 0, v_sub, v_cur, null::uuid, 'coupon_used'::text; return; end if;
  if cp.max_redemptions is not null then
    select count(*) into used from orders o where o.coupon_id = cp.id
      and (o.status in ('awaiting_review', 'paid') or (o.status = 'pending' and o.created_at > now() - interval '1 hour' and o.user_id <> p_user));
    if used >= cp.max_redemptions then
      return query select v_sub, 0, v_sub, v_cur, null::uuid, 'coupon_exhausted'::text; return; end if;
  end if;
  d := case when cp.percent_off is not null then (v_sub::bigint * cp.percent_off / 100)::int else cp.amount_off_minor end;
  if d >= v_sub then return query select v_sub, 0, v_sub, v_cur, null::uuid, 'coupon_invalid'::text; return; end if;   -- total must stay > 0
  return query select v_sub, d, v_sub - d, v_cur, cp.id, null::text;
end $$;
revoke all on function price_item(uuid, uuid, text, uuid, boolean) from public, anon, authenticated;

create or replace function quote_item(p_course uuid, p_bundle uuid, p_coupon text)
returns table (subtotal int, discount int, total int, currency char(3), err text)
language sql stable security definer set search_path = public as $$
  select p.subtotal, p.discount, p.total, p.currency, p.err from price_item(p_course, p_bundle, p_coupon, auth.uid(), false) p $$;
revoke all on function quote_item(uuid, uuid, text) from public, anon;
grant execute on function quote_item(uuid, uuid, text) to authenticated;

-- ---------- Orders ----------
drop function if exists create_order(uuid, payment_method);
create or replace function create_order(p_course uuid, p_bundle uuid, p_method payment_method, p_coupon text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare pr record; o_id uuid; o_status order_status; owned int; needed int; manual_on boolean;
begin
  if auth.uid() is null or current_role_of() is null then raise exception 'not allowed'; end if;
  if p_method = 'manual' then
    select coalesce((value->>'enabled')::boolean, false) into manual_on from settings where key = 'public.manual_payments';
    if not coalesce(manual_on, false) then raise exception 'manual payments disabled'; end if;
  end if;
  select * into pr from price_item(p_course, p_bundle, p_coupon, auth.uid(), true);
  if pr.err is not null then raise exception '%', pr.err; end if;

  if p_course is not null and exists (select 1 from enrollments e where e.user_id = auth.uid() and e.course_id = p_course
       and e.revoked_at is null and (e.expires_at is null or e.expires_at > now())) then raise exception 'already enrolled'; end if;
  if p_bundle is not null and not exists (select 1 from bundles where id = p_bundle and period_days is not null) then
    select count(*) into needed from bundle_courses where bundle_id = p_bundle;
    select count(*) into owned from bundle_courses bc join enrollments e on e.course_id = bc.course_id and e.user_id = auth.uid()
      and e.revoked_at is null and (e.expires_at is null or e.expires_at > now()) where bc.bundle_id = p_bundle;
    if owned >= needed then raise exception 'already enrolled'; end if;
  end if;

  select id, status into o_id, o_status from orders where user_id = auth.uid() and course_id is not distinct from p_course
    and bundle_id is not distinct from p_bundle and method = p_method and status in ('pending', 'awaiting_review');
  if found then
    if o_status = 'pending' then
      update orders set subtotal_minor = pr.subtotal, discount_minor = pr.discount, total_minor = pr.total, currency = pr.currency, coupon_id = pr.coupon_id
      where id = o_id;
    end if;
    return o_id;
  end if;
  insert into orders (user_id, course_id, bundle_id, coupon_id, subtotal_minor, discount_minor, total_minor, currency, method, status)
  values (auth.uid(), p_course, p_bundle, pr.coupon_id, pr.subtotal, pr.discount, pr.total, pr.currency, p_method, 'pending')
  returning id into o_id;
  return o_id;
end $$;
revoke all on function create_order(uuid, uuid, payment_method, text) from public, anon;
grant execute on function create_order(uuid, uuid, payment_method, text) to authenticated;

-- ---------- Manual payments ----------
create or replace function submit_manual_payment(p_order uuid, p_reference text, p_receipt text) returns void
language plpgsql security definer set search_path = public as $$
declare o orders; ref text := trim(coalesce(p_reference, ''));
begin
  select * into o from orders where id = p_order and user_id = auth.uid() for update;
  if not found or o.method <> 'manual' then raise exception 'invalid order'; end if;
  if o.status not in ('pending', 'awaiting_review') then raise exception 'invalid state'; end if;
  if length(ref) < 3 or length(ref) > 200 then raise exception 'reference required'; end if;
  if p_receipt is not null and left(p_receipt, length(auth.uid()::text) + 1) <> auth.uid()::text || '/' then raise exception 'bad receipt path'; end if;
  update orders set manual_reference = ref, manual_receipt_path = coalesce(p_receipt, manual_receipt_path), status = 'awaiting_review' where id = p_order;
end $$;
revoke all on function submit_manual_payment(uuid, text, text) from public, anon;
grant execute on function submit_manual_payment(uuid, text, text) to authenticated;

create or replace function approve_manual_order(p_order uuid) returns void
language plpgsql security definer set search_path = public as $$
declare o orders;
begin
  if not is_admin() then raise exception 'not allowed'; end if;
  select * into o from orders where id = p_order for update;
  if not found or o.method <> 'manual' then raise exception 'invalid order'; end if;
  if o.status <> 'awaiting_review' then raise exception 'order not awaiting review'; end if;
  update orders set status = 'paid', reviewed_by = auth.uid(), reviewed_at = now() where id = p_order;
  perform fulfill_order(p_order, 'purchase');
  insert into audit_logs (actor_id, action, entity, entity_id, details)
  values (auth.uid(), 'manual_payment_approved', 'order', p_order::text, jsonb_build_object('total', o.total_minor, 'reference', o.manual_reference));
end $$;

create or replace function reject_manual_order(p_order uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare o orders;
begin
  if not is_admin() then raise exception 'not allowed'; end if;
  select * into o from orders where id = p_order for update;
  if not found or o.method <> 'manual' or o.status <> 'awaiting_review' then raise exception 'invalid order'; end if;
  update orders set status = 'failed', reviewed_by = auth.uid(), reviewed_at = now(), review_note = left(coalesce(p_reason, ''), 500) where id = p_order;
  insert into audit_logs (actor_id, action, entity, entity_id, details)
  values (auth.uid(), 'manual_payment_rejected', 'order', p_order::text, jsonb_build_object('reason', left(coalesce(p_reason, ''), 500)));
end $$;
revoke all on function approve_manual_order(uuid), reject_manual_order(uuid, text) from public, anon;
grant execute on function approve_manual_order(uuid), reject_manual_order(uuid, text) to authenticated;   -- admin check is inside

-- Receipts: private bucket, each student writes only inside their own folder; admins read.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('payment-receipts', 'payment-receipts', false, 5242880, array['image/jpeg', 'image/png', 'application/pdf'])
on conflict (id) do update set file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
create policy "receipts_insert_own" on storage.objects for insert to authenticated
  with check (bucket_id = 'payment-receipts' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "receipts_read" on storage.objects for select to authenticated
  using (bucket_id = 'payment-receipts' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));
