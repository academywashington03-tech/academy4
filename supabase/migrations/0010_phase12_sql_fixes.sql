-- Phase 12: fixes found by running the SQL suites on a real PostgreSQL 16.
-- Safe to apply on a database that already has 0001..0009 (create or replace / idempotent revoke).

-- 1) price_item: the local variable `code` collided with the column coupons.code ("column reference \"code\" is ambiguous"),
--    which made every checkout/quote that carries a coupon fail at run time. Renamed to v_code.
-- 1b) Scope check used `cp.course_id = p_course OR cp.bundle_id = p_bundle`: when p_bundle (or p_course) is NULL the second operand is NULL,
--     so `NOT (false OR false OR NULL)` is NULL and a coupon scoped to course A was ACCEPTED for course B. Now every operand is NULL-safe.
create or replace function price_item(p_course uuid, p_bundle uuid, p_coupon text, p_user uuid, p_lock boolean default false)
returns table (subtotal int, discount int, total int, currency char(3), coupon_id uuid, err text)
language plpgsql security definer set search_path = public as $$
declare c courses; b bundles; cp coupons; v_sub int; v_cur char(3); d int := 0; used int; v_code text := upper(trim(coalesce(p_coupon, '')));
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
  if v_code = '' then return query select v_sub, 0, v_sub, v_cur, null::uuid, null::text; return; end if;

  if p_lock then select * into cp from coupons where upper(coupons.code) = v_code for update;
  else select * into cp from coupons where upper(coupons.code) = v_code; end if;
  if not found or not cp.active or (cp.expires_at is not null and cp.expires_at <= now())
     or not ((cp.course_id is null and cp.bundle_id is null)
             or (p_course is not null and cp.course_id = p_course)
             or (p_bundle is not null and cp.bundle_id = p_bundle)) then
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

-- 2) rate_limits is a server-only table: RLS (no policies) already hides rows, this also removes the table privileges
--    (Supabase grants ALL on public tables to anon/authenticated by default) so access fails loudly instead of silently.
revoke all on table rate_limits from anon, authenticated;
