-- Phase 7 checks (run after 0001-0005). Rolled back at the end. NOT YET EXECUTED by the author.
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
create function tst.pay(o uuid, txn text, amt int) returns text language sql as
$$ select process_online_payment('paymob', txn, o, amt, 'EGP', true, false, false, false, false, '{}') $$;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'admin@test.local'), ('00000000-0000-0000-0000-0000000000b1', 's1@test.local'),
  ('00000000-0000-0000-0000-0000000000b2', 's2@test.local'), ('00000000-0000-0000-0000-0000000000b3', 's3@test.local'),
  ('00000000-0000-0000-0000-0000000000b4', 's4@test.local');
update profiles set role = 'super_admin' where id = '00000000-0000-0000-0000-0000000000a1';
insert into courses (id, slug, title, is_free, price_minor, status) values
  ('00000000-0000-0000-0000-0000000000c1', 'course-a', 'A', false, 20000, 'published'),
  ('00000000-0000-0000-0000-0000000000c2', 'course-b', 'B', false, 10000, 'published');
insert into bundles (id, slug, title, price_minor, status, period_days) values
  ('00000000-0000-0000-0000-0000000000d1', 'bundle-plain', 'Plain', 25000, 'published', null),
  ('00000000-0000-0000-0000-0000000000d2', 'bundle-sub', 'Sub', 5000, 'published', 30);
insert into bundle_courses values ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000c1'),
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000c2'), ('00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000000c2');
insert into coupons (code, percent_off, amount_off_minor, expires_at, max_redemptions, course_id) values
  ('PCT20', 20, null, null, null, null), ('FIX5', null, 5000, null, null, '00000000-0000-0000-0000-0000000000c1'),
  ('EXPIRED', 10, null, now() - interval '1 day', null, null), ('MAX1', 10, null, null, 1, null), ('ALL100', 100, null, null, null, null);
insert into settings (key, value) values ('public.manual_payments', '{"enabled": true, "instructions": "x"}');

do $$
declare o uuid; o2 uuid; r record; n int; st order_status; ex timestamptz;
  A constant uuid := '00000000-0000-0000-0000-0000000000c1'; B constant uuid := '00000000-0000-0000-0000-0000000000c2';
  P constant uuid := '00000000-0000-0000-0000-0000000000d1'; S constant uuid := '00000000-0000-0000-0000-0000000000d2';
  u1 constant uuid := '00000000-0000-0000-0000-0000000000b1'; u2 constant uuid := '00000000-0000-0000-0000-0000000000b2';
  u3 constant uuid := '00000000-0000-0000-0000-0000000000b3'; u4 constant uuid := '00000000-0000-0000-0000-0000000000b4';
  adm constant uuid := '00000000-0000-0000-0000-0000000000a1';
begin
  -- ---------- coupons ----------
  perform tst.as_user(u1);
  select * into r from quote_item(A, null, 'pct20'); assert r.total = 16000 and r.discount = 4000 and r.err is null, 'percent coupon';
  select * into r from quote_item(B, null, 'FIX5');  assert r.err = 'coupon_invalid', 'scoped coupon applied to wrong course';
  select * into r from quote_item(A, null, 'FIX5');  assert r.total = 15000, 'fixed coupon';
  select * into r from quote_item(A, null, 'EXPIRED'); assert r.err = 'coupon_invalid', 'expired coupon accepted';
  select * into r from quote_item(A, null, 'ALL100'); assert r.err = 'coupon_invalid', '100% coupon must not be accepted';
  select * into r from quote_item(A, null, 'NOPE'); assert r.err = 'coupon_invalid';
  select count(*) into n from coupons; assert n = 0, 'student can read coupon table';
  assert tst.fails($q$ insert into coupons (code, percent_off) values ('HACK', 99) $q$, 'row-level security'), 'student created coupon';
  raise notice 'PASS coupon rules + coupon table is private';

  -- ---------- order with coupon, online, bundle, subscription ----------
  o := create_order(A, null, 'online', 'PCT20');
  select total_minor into n from orders where id = o; assert n = 16000, 'order must carry the discounted DB price';
  assert tst.fails($q$ select create_order('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000d1', 'online') $q$, 'unavailable'), 'course+bundle accepted';
  perform tst.as_owner();
  assert tst.pay(o, 'X1', 15999) = 'amount_mismatch', 'wrong amount accepted';
  assert tst.pay(o, 'X2', 16000) = 'fulfilled', 'coupon order not fulfilled';
  perform tst.as_user(u1);
  assert tst.fails($q$ select create_order('00000000-0000-0000-0000-0000000000c2', null, 'online', 'PCT20') $q$, 'coupon_used'), 'coupon reused by same user';
  raise notice 'PASS coupon order priced and fulfilled by DB; one use per student';

  o := create_order(null, P, 'online');
  perform tst.as_owner();
  assert tst.pay(o, 'X3', 25000) = 'fulfilled', 'bundle not fulfilled';
  select count(*) into n from enrollments where user_id = u1; assert n = 2, 'bundle should leave user with A and B';
  assert (select source from enrollments where user_id = u1 and course_id = B) = 'bundle';
  raise notice 'PASS bundle enrolls all courses';

  perform tst.as_user(u1);
  o := create_order(null, S, 'online');
  perform tst.as_owner();
  assert tst.pay(o, 'X4', 5000) = 'fulfilled', 'subscription purchase';
  assert (select expires_at from enrollments where user_id = u1 and course_id = B) is null, 'lifetime access was downgraded by a subscription';
  raise notice 'PASS subscription never downgrades lifetime access';

  perform tst.as_user(u2);
  o := create_order(null, S, 'online');
  perform tst.as_owner();
  assert tst.pay(o, 'X5', 5000) = 'fulfilled';
  select expires_at into ex from enrollments where user_id = u2 and course_id = B;
  assert ex between now() + interval '29 days' and now() + interval '31 days', 'period end not ~30 days';
  perform tst.as_user(u2);
  o2 := create_order(null, S, 'online');
  perform tst.as_owner();
  assert tst.pay(o2, 'X6', 5000) = 'fulfilled';
  select expires_at into ex from enrollments where user_id = u2 and course_id = B;
  assert ex between now() + interval '59 days' and now() + interval '61 days', 'renewal did not extend the period';
  select count(*) into n from subscriptions where user_id = u2; assert n = 1, 'one subscription record per user+plan';
  raise notice 'PASS prepaid subscription period and renewal';

  -- ---------- coupon redemption limit ----------
  perform tst.as_user(u3);
  o := create_order(A, null, 'online', 'MAX1');
  perform tst.as_user(u4);
  select * into r from quote_item(A, null, 'MAX1'); assert r.err = 'coupon_exhausted', 'max redemptions not enforced';
  raise notice 'PASS redemption limit';

  -- ---------- manual payments ----------
  perform tst.as_user(u2);
  o := create_order(A, null, 'manual');
  assert tst.fails(format($q$ select approve_manual_order(%L) $q$, o), 'not allowed'), 'student approved own order';
  assert tst.fails(format($q$ select approve_manual_order(%L) $q$, o), 'not allowed');
  assert tst.fails(format($q$ select submit_manual_payment(%L, 'ab', null) $q$, o), 'reference'), 'short reference accepted';
  assert tst.fails(format($q$ select submit_manual_payment(%L, 'REF-123', %L) $q$, o, u1::text || '/x.png'), 'bad receipt path'), 'foreign receipt path accepted';
  perform submit_manual_payment(o, 'REF-123', u2::text || '/r.png');
  select status into st from orders where id = o; assert st = 'awaiting_review';
  select count(*) into n from enrollments where user_id = u2 and course_id = A; assert n = 0, 'access before approval';
  perform tst.as_user(adm);
  perform approve_manual_order(o);
  select count(*) into n from enrollments where user_id = u2 and course_id = A and revoked_at is null; assert n = 1, 'approval did not enroll';
  assert tst.fails(format($q$ select approve_manual_order(%L) $q$, o), 'not awaiting'), 'double approval allowed';
  select count(*) into n from audit_logs where action = 'manual_payment_approved' and entity_id = o::text and actor_id = adm; assert n = 1, 'approval not audited';
  raise notice 'PASS TEST 12 manual approval works, is admin-only and is audited';

  perform tst.as_user(u3);
  o := create_order(B, null, 'manual');
  perform submit_manual_payment(o, 'REF-999', null);
  perform tst.as_user(adm);
  perform reject_manual_order(o, 'no transfer found');
  select count(*) into n from enrollments where user_id = u3 and course_id = B; assert n = 0, 'rejected order granted access';
  select status into st from orders where id = o; assert st = 'failed';
  raise notice 'PASS rejection grants nothing';

  -- manual orders cannot be completed through the online-payment function
  perform tst.as_user(u4);
  o := create_order(B, null, 'manual');
  perform tst.as_owner();
  assert process_online_payment('paymob', 'X9', o, 10000, 'EGP', true, false, false, false, false, '{}') = 'wrong_method', 'online webhook fulfilled a manual order';
  raise notice 'PASS manual and online paths stay separate';
end $$;
rollback;
