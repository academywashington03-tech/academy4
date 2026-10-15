-- Phase 9: notifications (+email outbox), announcements, admin operations, reports, registration switch.
alter table profiles add column if not exists notify_email boolean not null default true;
alter table notifications add column if not exists link text;
alter table notifications add column if not exists email_status text not null default 'skipped' check (email_status in ('pending', 'sent', 'skipped', 'failed'));
alter table notifications add column if not exists email_attempts int not null default 0;
create index if not exists notifications_user_created on notifications (user_id, created_at desc);
create index if not exists notifications_pending_email on notifications (created_at) where email_status = 'pending';

-- Internal: creates the in-app notification and queues an email if the student allows it. Not callable by clients.
create or replace function queue_notification(p_user uuid, p_kind text, p_title text, p_body text, p_link text, p_email boolean default true) returns void
language plpgsql security definer set search_path = public as $$
declare pref boolean;
begin
  select notify_email into pref from profiles where id = p_user;
  if not found then return; end if;
  insert into notifications (user_id, kind, title, body, link, email_status)
  values (p_user, p_kind, left(p_title, 200), left(coalesce(p_body, ''), 1000), p_link, case when p_email and pref then 'pending' else 'skipped' end);
end $$;
revoke all on function queue_notification(uuid, text, text, text, text, boolean) from public, anon, authenticated;

-- ---------- Re-define fulfillment / enrollment / certificate / rejection with notifications ----------
create or replace function fulfill_order(p_order uuid, p_source enroll_source) returns boolean
language plpgsql security definer set search_path = public as $$
declare o orders; b bundles; c courses; cid uuid; sub_id uuid; period_end timestamptz; src enroll_source; exp timestamptz; item_title text;
begin
  select * into o from orders where id = p_order for update;
  if not found then raise exception 'order not found'; end if;
  if o.fulfilled_at is not null then return false; end if;
  if o.status <> 'paid' then raise exception 'order not paid'; end if;
  src := p_source;
  if o.bundle_id is not null then
    select * into b from bundles where id = o.bundle_id;
    src := 'bundle'; item_title := b.title;
    if b.period_days is not null then
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
    if item_title is null then item_title := c.title; end if;
    exp := case when sub_id is not null then period_end when c.access_days is null then null else now() + make_interval(days => c.access_days) end;
    insert into enrollments (user_id, course_id, source, order_id, subscription_id, expires_at)
    values (o.user_id, cid, src, o.id, sub_id, exp)
    on conflict (user_id, course_id) do update set
      revoked_at = null, order_id = excluded.order_id, source = excluded.source,
      subscription_id = coalesce(excluded.subscription_id, enrollments.subscription_id),
      expires_at = case when enrollments.revoked_at is not null then excluded.expires_at
                        when enrollments.expires_at is null then null
                        when excluded.expires_at is null then null
                        else greatest(enrollments.expires_at, excluded.expires_at) end;
  end loop;
  update orders set fulfilled_at = now() where id = p_order;
  insert into audit_logs (actor_id, action, entity, entity_id) values (auth.uid(), 'order_fulfilled', 'order', p_order::text);
  perform queue_notification(o.user_id, 'payment_confirmed', 'تم تأكيد الدفع وتفعيل دورتك', item_title, '/dashboard');
  return true;
end $$;
revoke all on function fulfill_order(uuid, enroll_source) from public, anon, authenticated;

create or replace function enroll_free(p_course uuid) returns void
language plpgsql security definer set search_path = public as $$
declare c courses; e enrollments;
begin
  if auth.uid() is null or current_role_of() is null then raise exception 'not allowed'; end if;
  select * into c from courses where id = p_course and status = 'published' and is_free and enrollment_open;
  if not found then raise exception 'course not available'; end if;
  select * into e from enrollments where user_id = auth.uid() and course_id = p_course;
  if found then
    if e.revoked_at is not null then raise exception 'access revoked'; end if;
    return;
  end if;
  insert into enrollments (user_id, course_id, source, expires_at)
  values (auth.uid(), p_course, 'free', case when c.access_days is null then null else now() + (c.access_days || ' days')::interval end);
  perform queue_notification(auth.uid(), 'enrollment', 'تم تسجيلك في الدورة', c.title, '/learn/' || c.slug);
end $$;
revoke all on function enroll_free(uuid) from public, anon;
grant execute on function enroll_free(uuid) to authenticated;

create or replace function try_issue_certificate(p_course uuid) returns text
language plpgsql security definer set search_path = public as $$
declare c courses; e record; existing certificates; cert_no text; h text; tries int := 0; ins int; sname text; iname text;
begin
  if auth.uid() is null or current_role_of() is null then return null; end if;
  select * into c from courses where id = p_course and certificate_enabled;
  if not found or not has_access(p_course) then return null; end if;
  select * into existing from certificates where user_id = auth.uid() and course_id = p_course;
  if found then return case when existing.revoked_at is null then existing.certificate_no else null end; end if;
  select * into e from my_course_completion(p_course);
  if not coalesce(e.eligible, false) then return null; end if;
  select full_name into sname from profiles where id = auth.uid();
  select full_name into iname from profiles where id = c.instructor_id;
  loop
    h := upper(encode(gen_random_bytes(6), 'hex'));
    cert_no := 'WA-' || to_char(now(), 'YYYY') || '-' || substr(h, 1, 4) || '-' || substr(h, 5, 4) || '-' || substr(h, 9, 4);
    insert into certificates (certificate_no, user_id, course_id, student_name, course_title, instructor_name)
    values (cert_no, auth.uid(), p_course, sname, c.title, iname) on conflict do nothing;
    get diagnostics ins = row_count;
    exit when ins = 1;
    select * into existing from certificates where user_id = auth.uid() and course_id = p_course;
    if found then return existing.certificate_no; end if;
    tries := tries + 1; if tries > 5 then return null; end if;
  end loop;
  perform queue_notification(auth.uid(), 'certificate', 'حصلت على شهادة إتمام', c.title, '/certificates');
  return cert_no;
end $$;
revoke all on function try_issue_certificate(uuid) from public, anon;
grant execute on function try_issue_certificate(uuid) to authenticated;

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
  perform queue_notification(o.user_id, 'payment_rejected', 'تعذّر اعتماد دفعك اليدوي', coalesce(nullif(left(p_reason, 300), ''), 'يرجى التواصل مع الإدارة.'), '/orders');
end $$;
revoke all on function reject_manual_order(uuid, text) from public, anon;
grant execute on function reject_manual_order(uuid, text) to authenticated;

-- ---------- Announcements (platform-wide: admin only; course: that course's managers) ----------
create or replace function publish_announcement(p_course uuid, p_title text, p_body text, p_email boolean default true) returns int
language plpgsql security definer set search_path = public as $$
declare n int; link text := '/dashboard';
begin
  if p_course is null then
    if not is_admin() then raise exception 'not allowed'; end if;
  elsif not manages_course(p_course) then raise exception 'not allowed';
  end if;
  if length(trim(coalesce(p_title, ''))) < 3 or length(p_title) > 150 or length(trim(coalesce(p_body, ''))) < 3 or length(p_body) > 5000 then raise exception 'invalid announcement'; end if;
  insert into announcements (course_id, title, body, created_by) values (p_course, trim(p_title), trim(p_body), auth.uid());
  if p_course is not null then select '/learn/' || slug into link from courses where id = p_course; end if;
  insert into notifications (user_id, kind, title, body, link, email_status)
  select p.id, 'announcement', left(trim(p_title), 200), left(trim(p_body), 300), link, case when p_email and p.notify_email then 'pending' else 'skipped' end
  from profiles p
  where not p.suspended and (
    (p_course is null) or exists (select 1 from enrollments e where e.user_id = p.id and e.course_id = p_course
       and e.revoked_at is null and (e.expires_at is null or e.expires_at > now())));
  get diagnostics n = row_count;
  insert into audit_logs (actor_id, action, entity, entity_id, details)
  values (auth.uid(), 'announcement_published', 'announcement', coalesce(p_course::text, 'platform'), jsonb_build_object('recipients', n, 'email', p_email));
  return n;
end $$;
revoke all on function publish_announcement(uuid, text, text, boolean) from public, anon;
grant execute on function publish_announcement(uuid, text, text, boolean) to authenticated;

-- ---------- Administrator operations (all audited, admin only) ----------
create or replace function admin_grant_access(p_user uuid, p_course uuid, p_days int, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare c courses;
begin
  if not is_admin() then raise exception 'not allowed'; end if;
  select * into c from courses where id = p_course;
  if not found or not exists (select 1 from profiles where id = p_user) then raise exception 'not found'; end if;
  if p_days is not null and (p_days < 1 or p_days > 3650) then raise exception 'bad days'; end if;
  insert into enrollments (user_id, course_id, source, expires_at)
  values (p_user, p_course, 'manual_grant', case when p_days is null then null else now() + make_interval(days => p_days) end)
  on conflict (user_id, course_id) do update set revoked_at = null, source = 'manual_grant',
    expires_at = case when p_days is null then null else now() + make_interval(days => p_days) end;
  insert into audit_logs (actor_id, action, entity, entity_id, details)
  values (auth.uid(), 'access_granted', 'profile', p_user::text, jsonb_build_object('course', p_course, 'days', p_days, 'reason', left(coalesce(p_reason, ''), 300)));
  perform queue_notification(p_user, 'enrollment', 'تم منحك الوصول إلى دورة', c.title, '/learn/' || c.slug);
end $$;

create or replace function admin_revoke_access(p_enrollment uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare e enrollments;
begin
  if not is_admin() then raise exception 'not allowed'; end if;
  update enrollments set revoked_at = now() where id = p_enrollment and revoked_at is null returning * into e;
  if not found then raise exception 'not found'; end if;
  insert into audit_logs (actor_id, action, entity, entity_id, details)
  values (auth.uid(), 'access_revoked', 'profile', e.user_id::text, jsonb_build_object('course', e.course_id, 'reason', left(coalesce(p_reason, ''), 300)));
end $$;

create or replace function admin_set_suspended(p_user uuid, p_flag boolean, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare r user_role;
begin
  if not is_admin() then raise exception 'not allowed'; end if;
  select role into r from profiles where id = p_user;
  if not found then raise exception 'not found'; end if;
  if r = 'super_admin' then raise exception 'cannot suspend an administrator'; end if;
  update profiles set suspended = p_flag where id = p_user;
  insert into audit_logs (actor_id, action, entity, entity_id, details)
  values (auth.uid(), case when p_flag then 'account_suspended' else 'account_reactivated' end, 'profile', p_user::text, jsonb_build_object('reason', left(coalesce(p_reason, ''), 300)));
end $$;
revoke all on function admin_grant_access(uuid, uuid, int, text), admin_revoke_access(uuid, text), admin_set_suspended(uuid, boolean, text) from public, anon;
grant execute on function admin_grant_access(uuid, uuid, int, text), admin_revoke_access(uuid, text), admin_set_suspended(uuid, boolean, text) to authenticated;

-- ---------- Reports ----------
create or replace function admin_course_performance()
returns table (course_id uuid, title text, enrollments int, active int, completed int, paid_orders int, revenue_minor bigint, refunded_orders int)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'not allowed'; end if;
  return query
  select c.id, c.title,
    (select count(*) from enrollments e where e.course_id = c.id)::int,
    (select count(*) from enrollments e where e.course_id = c.id and e.revoked_at is null and (e.expires_at is null or e.expires_at > now()))::int,
    (select count(*) from enrollments e where e.course_id = c.id
       and (select count(*) from lessons l where l.course_id = c.id and l.published and l.required_for_completion) > 0
       and (select count(*) from lessons l where l.course_id = c.id and l.published and l.required_for_completion)
         = (select count(*) from lesson_progress lp join lessons l on l.id = lp.lesson_id where lp.user_id = e.user_id and l.course_id = c.id
              and l.published and l.required_for_completion and lp.completed_at is not null))::int,
    (select count(*) from orders o where o.course_id = c.id and o.status = 'paid')::int,
    coalesce((select sum(o.total_minor) from orders o where o.course_id = c.id and o.status = 'paid'), 0)::bigint,
    (select count(*) from orders o where o.course_id = c.id and o.status = 'refunded')::int
  from courses c order by 5 desc, c.title;
end $$;

-- Payment reconciliation: anything here deserves a human look.
create or replace function admin_reconciliation() returns table (issue text, order_id uuid, detail text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'not allowed'; end if;
  return query
  select 'paid_online_without_verified_transaction'::text, o.id, 'الطلب مدفوع بلا عملية ناجحة مسجّلة'::text
    from orders o where o.status = 'paid' and o.method = 'online'
      and not exists (select 1 from payment_transactions t where t.order_id = o.id and t.success and t.outcome = 'fulfilled')
  union all
  select 'amount_mismatch', t.order_id, 'مبلغ العملية ' || t.amount_minor || ' لا يطابق الطلب' from payment_transactions t where t.outcome = 'amount_mismatch'
  union all
  select 'paid_but_not_fulfilled', o.id, 'مدفوع ولم يُفعَّل الاشتراك' from orders o where o.status = 'paid' and o.fulfilled_at is null
  union all
  select 'manual_paid_without_reviewer', o.id, 'اعتماد يدوي بلا مراجع' from orders o where o.status = 'paid' and o.method = 'manual' and o.reviewed_by is null
  union all
  select 'stale_pending_online', o.id, 'معلّق منذ أكثر من 24 ساعة بعد بدء الدفع' from orders o
    where o.status = 'pending' and o.method = 'online' and o.provider_ref is not null and o.created_at < now() - interval '24 hours'
  union all
  select 'purchase_enrollment_without_paid_order', e.id, 'اشتراك من شراء بلا طلب مدفوع' from enrollments e
    where e.source in ('purchase', 'bundle', 'subscription') and e.revoked_at is null
      and not exists (select 1 from orders o where o.id = e.order_id and o.status in ('paid', 'refunded'));
end $$;
revoke all on function admin_course_performance(), admin_reconciliation() from public, anon;
grant execute on function admin_course_performance(), admin_reconciliation() to authenticated;   -- admin check inside

-- ---------- Registration switch enforced where it cannot be bypassed (auth.users insert) ----------
create or replace function enforce_registration_open() returns trigger
language plpgsql security definer set search_path = public as $$
declare open boolean;
begin
  select coalesce((value ->> 'registration_open')::boolean, true) into open from settings where key = 'public.academy';
  if coalesce(open, true) = false then raise exception 'registration closed'; end if;
  return new;
end $$;
drop trigger if exists before_user_created on auth.users;
create trigger before_user_created before insert on auth.users for each row execute function enforce_registration_open();

-- Students may only mark their own notifications as read (they must not edit email_status/title/body).
drop policy if exists n_own_upd on notifications;
create or replace function mark_notifications_read() returns void
language sql security definer set search_path = public as
$$ update notifications set read_at = now() where user_id = auth.uid() and read_at is null $$;
revoke all on function mark_notifications_read() from public, anon;
grant execute on function mark_notifications_read() to authenticated;
