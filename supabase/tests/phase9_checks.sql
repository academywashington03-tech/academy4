-- Phase 9 checks (run after 0001-0007). Rolled back at the end. NOT YET EXECUTED by the author.
begin;
create schema tst;
grant usage on schema tst to anon, authenticated;
create function tst.as_user(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;
create function tst.as_owner() returns void language plpgsql as $$
begin execute 'reset role'; perform set_config('request.jwt.claims', '', true); end $$;
create function tst.fails(q text, needle text) returns boolean language plpgsql as $$
begin execute q; return false; exception when others then return sqlerrm like '%' || needle || '%'; end $$;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'admin@test.local'), ('00000000-0000-0000-0000-0000000000a2', 'inst@test.local'),
  ('00000000-0000-0000-0000-0000000000b1', 's1@test.local'), ('00000000-0000-0000-0000-0000000000b2', 's2@test.local'), ('00000000-0000-0000-0000-0000000000b3', 's3@test.local');
update profiles set role = 'super_admin' where id = '00000000-0000-0000-0000-0000000000a1';
update profiles set role = 'instructor' where id = '00000000-0000-0000-0000-0000000000a2';
update profiles set notify_email = false where id = '00000000-0000-0000-0000-0000000000b3';
insert into courses (id, slug, title, is_free, price_minor, status, instructor_id) values
  ('00000000-0000-0000-0000-0000000000c1', 'free-own', 'Free Own', true, 0, 'published', '00000000-0000-0000-0000-0000000000a2'),
  ('00000000-0000-0000-0000-0000000000c2', 'paid-other', 'Paid Other', false, 10000, 'published', null);

do $$
declare C1 constant uuid := '00000000-0000-0000-0000-0000000000c1'; C2 constant uuid := '00000000-0000-0000-0000-0000000000c2';
  adm constant uuid := '00000000-0000-0000-0000-0000000000a1'; ins constant uuid := '00000000-0000-0000-0000-0000000000a2';
  s1 constant uuid := '00000000-0000-0000-0000-0000000000b1'; s2 constant uuid := '00000000-0000-0000-0000-0000000000b2'; s3 constant uuid := '00000000-0000-0000-0000-0000000000b3';
  n int; o uuid; st text; e uuid; total int;
begin
  -- ---------- notifications ----------
  perform tst.as_user(s1); perform enroll_free(C1);
  select count(*) into n from notifications where user_id = s1 and kind = 'enrollment' and email_status = 'pending'; assert n = 1, 'enrollment notification/email not queued';
  perform tst.as_user(s3); perform enroll_free(C1);
  select email_status into st from notifications where user_id = s3 and kind = 'enrollment'; assert st = 'skipped', 'email queued despite opt-out';
  select count(*) into n from notifications; assert n = 1, 'student sees other users notifications';
  update notifications set email_status = 'pending', title = 'hacked'; select count(*) into n from notifications where title = 'hacked'; assert n = 0, 'student edited a notification';
  perform mark_notifications_read(); select count(*) into n from notifications where read_at is not null; assert n = 1;
  raise notice 'PASS notifications: queued, opt-out respected, private, read-only for students';

  -- confirmed payment notifies the student
  perform tst.as_user(s2); o := create_order(C2, null, 'online');
  perform tst.as_owner();
  assert process_online_payment('paymob', 'N1', o, 10000, 'EGP', true, false, false, false, false, '{}') = 'fulfilled';
  select count(*) into n from notifications where user_id = s2 and kind = 'payment_confirmed'; assert n = 1, 'payment confirmation not created';
  assert process_online_payment('paymob', 'N1', o, 10000, 'EGP', true, false, false, false, false, '{}') = 'duplicate';
  select count(*) into n from notifications where user_id = s2 and kind = 'payment_confirmed'; assert n = 1, 'duplicate webhook sent a second notification';
  raise notice 'PASS payment confirmation notification is sent once';

  -- ---------- announcements ----------
  perform tst.as_user(s1);
  assert tst.fails($q$ select publish_announcement(null, 'Title', 'Body text', true) $q$, 'not allowed'), 'student published';
  perform tst.as_user(ins);
  assert tst.fails($q$ select publish_announcement(null, 'Title', 'Body text', true) $q$, 'not allowed'), 'instructor published platform-wide';
  assert tst.fails($q$ select publish_announcement('00000000-0000-0000-0000-0000000000c2', 'Title', 'Body text', true) $q$, 'not allowed'), 'instructor published to a foreign course';
  assert publish_announcement(C1, 'Hello class', 'New material', true) = 2, 'course announcement recipients (s1, s3)';
  perform tst.as_user(adm);
  select count(*) into total from profiles where not suspended;
  assert publish_announcement(null, 'Platform', 'Maintenance tonight', false) = total, 'platform announcement recipients';
  perform tst.as_owner();
  select count(*) into n from notifications where kind = 'announcement' and title = 'Platform' and email_status = 'skipped'; assert n = total, 'email=false must skip email';
  raise notice 'PASS announcements are authorized in the DB and fan out correctly';

  -- ---------- admin operations ----------
  perform tst.as_user(s1);
  assert tst.fails(format($q$ select admin_grant_access(%L, %L, null, 'x') $q$, s1, C2), 'not allowed'), 'student granted themselves access';
  perform tst.as_user(adm);
  perform admin_grant_access(s1, C2, 30, 'gift');
  select count(*) into n from enrollments where user_id = s1 and course_id = C2 and revoked_at is null and source = 'manual_grant'; assert n = 1;
  select id into e from enrollments where user_id = s1 and course_id = C2;
  perform admin_revoke_access(e, 'refund by cash');
  select count(*) into n from enrollments where id = e and revoked_at is not null; assert n = 1;
  select count(*) into n from audit_logs where actor_id = adm and action in ('access_granted', 'access_revoked'); assert n = 2, 'grant/revoke not audited';
  assert tst.fails(format($q$ select admin_set_suspended(%L, true, 'x') $q$, adm), 'cannot suspend an administrator'), 'admin suspended';
  perform admin_set_suspended(s2, true, 'abuse');
  perform tst.as_user(s2);
  assert tst.fails($q$ select enroll_free('00000000-0000-0000-0000-0000000000c1') $q$, 'not allowed'), 'suspended user could enroll';
  perform tst.as_user(adm); perform admin_set_suspended(s2, false, 'ok');
  raise notice 'PASS admin grant/revoke/suspend are admin-only, audited, and suspension takes effect';

  -- ---------- audit log + reconciliation ----------
  perform tst.as_user(s1);
  select count(*) into n from audit_logs; assert n = 0, 'student can read the audit log';
  assert tst.fails($q$ select * from admin_reconciliation() $q$, 'not allowed'), 'student ran reconciliation';
  perform tst.as_owner();
  update orders set status = 'paid' where id = (select id from orders where user_id = s2 limit 1);   -- already paid, make an anomaly instead:
  update payment_transactions set outcome = 'amount_mismatch' where provider_txn_id = 'N1';
  perform tst.as_user(adm);
  select count(*) into n from admin_reconciliation() where issue in ('amount_mismatch', 'paid_online_without_verified_transaction'); assert n >= 1, 'anomaly not reported';
  select count(*) into n from admin_course_performance() where course_id = C2 and paid_orders = 1 and revenue_minor = 10000; assert n = 1, 'performance report';
  raise notice 'PASS audit log private; reconciliation and performance reports work';
end $$;

-- ---------- registration switch ----------
do $$
begin
  perform tst.as_owner();
  insert into settings (key, value) values ('public.academy', '{"registration_open": false}');
  assert tst.fails($q$ insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000f9', 'late@test.local') $q$, 'registration closed'), 'sign-up allowed while closed';
  update settings set value = '{"registration_open": true}' where key = 'public.academy';
  insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000f9', 'late@test.local');
  raise notice 'PASS registration switch is enforced on auth.users';
end $$;
rollback;
