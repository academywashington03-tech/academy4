-- Phase 6 checks (run after 0001-0004). Rolled back at the end. NOT YET EXECUTED by the author.
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

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000b1', 'stu1@test.local'), ('00000000-0000-0000-0000-0000000000b2', 'stu2@test.local');
insert into courses (id, slug, title, is_free, price_minor, promo_price_minor, status) values
  ('00000000-0000-0000-0000-0000000000f2', 'paid-p6', 'Paid', false, 20000, 15000, 'published');

do $$
declare oid uuid; oid2 uuid; n int; r text; st order_status; amt int;
begin
  perform tst.as_user('00000000-0000-0000-0000-0000000000b1');
  oid := create_order('00000000-0000-0000-0000-0000000000f2', null, 'online');
  oid2 := create_order('00000000-0000-0000-0000-0000000000f2', null, 'online');
  assert oid = oid2, 'second create_order must reuse the open order';
  select total_minor into amt from orders where id = oid;
  assert amt = 15000, 'price must come from the database (promo price)';
  raise notice 'PASS server-side price, order reuse';

  begin insert into orders (user_id, course_id, subtotal_minor, total_minor, currency, method) values ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000f2', 1, 1, 'EGP', 'online');
    assert false, 'student inserted order';
  exception when others then if sqlerrm = 'student inserted order' then raise; end if; end;
  begin update orders set status = 'paid', total_minor = 1 where id = oid; select count(*) into n from orders where id = oid and status = 'paid'; assert n = 0, 'student marked order paid';
  exception when others then if sqlerrm = 'student marked order paid' then raise; end if; end;
  begin perform process_online_payment('paymob', 'T0', oid, 15000, 'EGP', true, false, false, false, false, '{}'); assert false, 'student called webhook fn';
  exception when others then if sqlerrm = 'student called webhook fn' then raise; end if; end;
  raise notice 'PASS students cannot write orders or call the payment function';

  perform tst.as_owner();
  -- failed payment: no access
  r := process_online_payment('paymob', 'T1', oid, 15000, 'EGP', false, false, false, false, false, '{}');
  select count(*) into n from enrollments where user_id = '00000000-0000-0000-0000-0000000000b1'; assert n = 0 and r = 'failed', 'failed payment gave access';
  raise notice 'PASS TEST 11 failed payment grants nothing';

  -- amount mismatch: no access
  r := process_online_payment('paymob', 'T2', oid, 100, 'EGP', true, false, false, false, false, '{}');
  select count(*) into n from enrollments where user_id = '00000000-0000-0000-0000-0000000000b1'; assert n = 0 and r = 'amount_mismatch', 'mismatch gave access';
  r := process_online_payment('paymob', 'T3', oid, 15000, 'USD', true, false, false, false, false, '{}');
  assert r = 'amount_mismatch', 'currency mismatch accepted';
  raise notice 'PASS amount/currency validated';

  -- pending and auth-only: no access
  r := process_online_payment('paymob', 'T4', oid, 15000, 'EGP', false, true, false, false, false, '{}'); assert r = 'pending';
  r := process_online_payment('paymob', 'T5', oid, 15000, 'EGP', true, false, false, false, true, '{}'); assert r = 'authorized_only';
  select count(*) into n from enrollments where user_id = '00000000-0000-0000-0000-0000000000b1'; assert n = 0, 'pending/auth gave access';
  raise notice 'PASS pending and auth-only grant nothing';

  -- success: fulfilled once
  r := process_online_payment('paymob', 'T6', oid, 15000, 'EGP', true, false, false, false, false, '{}');
  assert r = 'fulfilled', 'success not fulfilled';
  select status into st from orders where id = oid; assert st = 'paid';
  select count(*) into n from enrollments where user_id = '00000000-0000-0000-0000-0000000000b1' and course_id = '00000000-0000-0000-0000-0000000000f2'; assert n = 1;
  raise notice 'PASS TEST 9 verified payment enrolls';

  -- duplicate delivery + a different txn id for the same order: still one enrollment
  r := process_online_payment('paymob', 'T6', oid, 15000, 'EGP', true, false, false, false, false, '{}'); assert r = 'duplicate';
  r := process_online_payment('paymob', 'T7', oid, 15000, 'EGP', true, false, false, false, false, '{}'); assert r = 'duplicate';
  select count(*) into n from enrollments where user_id = '00000000-0000-0000-0000-0000000000b1'; assert n = 1, 'duplicate enrollment';
  select count(*) into n from orders where user_id = '00000000-0000-0000-0000-0000000000b1'; assert n = 1, 'duplicate order';
  raise notice 'PASS TEST 10 duplicates change nothing';

  -- a late failure must not downgrade a paid order
  r := process_online_payment('paymob', 'T8', oid, 15000, 'EGP', false, false, false, false, false, '{}');
  select status into st from orders where id = oid; assert st = 'paid', 'paid order downgraded';
  raise notice 'PASS late failure does not downgrade';

  -- refund revokes access
  r := process_online_payment('paymob', 'T9', oid, 15000, 'EGP', true, false, true, false, false, '{}'); assert r = 'refunded';
  select count(*) into n from enrollments where user_id = '00000000-0000-0000-0000-0000000000b1' and revoked_at is null; assert n = 0, 'refund kept access';
  raise notice 'PASS refund revokes access';

  -- a student cannot buy a course they already own after repurchase is blocked only while active; unknown order is harmless
  r := process_online_payment('paymob', 'T10', '00000000-0000-0000-0000-000000000099', 1, 'EGP', true, false, false, false, false, '{}');
  assert r = 'unknown_order';
  raise notice 'PASS unknown order ignored';
end $$;
rollback;
