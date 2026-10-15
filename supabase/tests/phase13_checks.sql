-- Phase 13 checks (run after 0001-0011). Rolled back at the end. NOT YET EXECUTED by the author: run it on a TEST database first.
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

insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000d1', 'stu13@test.local');
insert into courses (id, slug, title, is_free, price_minor, status) values
  ('00000000-0000-0000-0000-0000000000e1', 'p13-a', 'Course A', false, 10000, 'published'),
  ('00000000-0000-0000-0000-0000000000e2', 'p13-b', 'Course B', false, 10000, 'published'),
  ('00000000-0000-0000-0000-0000000000e3', 'p13-c', 'Course C', false, 10000, 'published'),
  ('00000000-0000-0000-0000-0000000000e4', 'p13-d', 'Course D', false, 10000, 'published');

do $$
declare oa uuid; ob uuid; r text; n int; st order_status;
begin
  perform tst.as_user('00000000-0000-0000-0000-0000000000d1');
  oa := create_order('00000000-0000-0000-0000-0000000000e1', null, 'online');
  ob := create_order('00000000-0000-0000-0000-0000000000e2', null, 'online');
  perform tst.as_owner();

  -- one genuine transaction pays order A
  r := process_online_payment('paymob', 'TX13', oa, 10000, 'EGP', true, false, false, false, false, '{}');
  assert r = 'fulfilled', 'order A not fulfilled: ' || r;

  -- the SAME transaction id replayed against order B (same price) must NOT fulfil B
  r := process_online_payment('paymob', 'TX13', ob, 10000, 'EGP', true, false, false, false, false, '{}');
  assert r = 'txn_order_mismatch', 'replayed transaction accepted for another order: ' || r;
  select status into st from orders where id = ob; assert st = 'pending', 'order B changed state';
  select count(*) into n from enrollments where course_id = '00000000-0000-0000-0000-0000000000e2'; assert n = 0, 'order B granted access';
  select count(*) into n from audit_logs where action = 'payment_txn_order_mismatch'; assert n = 1, 'mismatch not audited';
  raise notice 'PASS a transaction id cannot fulfil a second order';

  -- redelivery of the same transaction for the same order is still an idempotent duplicate
  r := process_online_payment('paymob', 'TX13', oa, 10000, 'EGP', true, false, false, false, false, '{}');
  assert r = 'duplicate', 'same-order redelivery changed: ' || r;
  raise notice 'PASS same-order redelivery stays idempotent';
end $$;

-- more payment paths (pending -> success on the SAME txn, amount/currency mismatch, provider refund, late success after refund)
do $$
declare oc uuid; od uuid; r text; n int; st order_status;
begin
  perform tst.as_user('00000000-0000-0000-0000-0000000000d1');
  oc := create_order('00000000-0000-0000-0000-0000000000e3', null, 'online');
  od := create_order('00000000-0000-0000-0000-0000000000e4', null, 'online');
  perform tst.as_owner();

  -- pending callback grants nothing; the later success for the SAME txn and order fulfils it (ON CONFLICT .. DO UPDATE path)
  r := process_online_payment('paymob', 'TX13P', oc, 10000, 'EGP', false, true, false, false, false, '{}');
  assert r = 'pending', 'pending callback: ' || r;
  select count(*) into n from enrollments where course_id = '00000000-0000-0000-0000-0000000000e3'; assert n = 0, 'pending granted access';
  r := process_online_payment('paymob', 'TX13P', oc, 10000, 'EGP', true, false, false, false, false, '{}');
  assert r = 'fulfilled', 'pending -> success did not fulfil: ' || r;
  select count(*) into n from enrollments where course_id = '00000000-0000-0000-0000-0000000000e3' and revoked_at is null; assert n = 1, 'access not granted after success';
  raise notice 'PASS pending then success on the same transaction fulfils once';

  -- wrong amount / wrong currency never fulfil
  r := process_online_payment('paymob', 'TX13M1', od, 9999, 'EGP', true, false, false, false, false, '{}');
  assert r = 'amount_mismatch', 'wrong amount accepted: ' || r;
  r := process_online_payment('paymob', 'TX13M2', od, 10000, 'USD', true, false, false, false, false, '{}');
  assert r = 'amount_mismatch', 'wrong currency accepted: ' || r;
  select status into st from orders where id = od; assert st = 'pending', 'mismatch changed order state';
  select count(*) into n from enrollments where course_id = '00000000-0000-0000-0000-0000000000e4'; assert n = 0, 'mismatch granted access';
  raise notice 'PASS amount and currency mismatches never fulfil';

  -- provider refund revokes access; a late success callback afterwards is ignored
  r := process_online_payment('paymob', 'TX13R', oc, 10000, 'EGP', true, false, true, false, false, '{}');
  assert r = 'refunded', 'refund callback: ' || r;
  select status into st from orders where id = oc; assert st = 'refunded', 'order not marked refunded';
  select count(*) into n from enrollments where course_id = '00000000-0000-0000-0000-0000000000e3' and revoked_at is null; assert n = 0, 'refund did not revoke access';
  r := process_online_payment('paymob', 'TX13P', oc, 10000, 'EGP', true, false, false, false, false, '{}');
  assert r = 'ignored', 'late success after refund: ' || r;
  select count(*) into n from enrollments where course_id = '00000000-0000-0000-0000-0000000000e3' and revoked_at is null; assert n = 0, 'late success re-granted access';
  raise notice 'PASS refund revokes access and a late success does not restore it';

  -- unknown order
  r := process_online_payment('paymob', 'TX13U', gen_random_uuid(), 10000, 'EGP', true, false, false, false, false, '{}');
  assert r = 'unknown_order', 'unknown order: ' || r;
  raise notice 'PASS unknown order reference is rejected';
end $$;

-- regression guard for the certificate fix: the deployed function must no longer call pgcrypto's gen_random_bytes().
-- (Actual issuing is exercised end to end by phase8_checks.sql, which asserts the WA-YYYY-XXXX-XXXX-XXXX format.)
do $$
declare src text;
begin
  select prosrc into src from pg_proc where proname = 'try_issue_certificate' and pronamespace = 'public'::regnamespace;
  assert src is not null, 'try_issue_certificate missing';
  assert src not like '%gen_random_bytes%', 'try_issue_certificate still depends on pgcrypto';
  raise notice 'PASS try_issue_certificate no longer depends on pgcrypto';
end $$;
rollback;
