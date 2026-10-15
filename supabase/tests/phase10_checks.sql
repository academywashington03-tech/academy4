-- Phase 10 checks: instructor boundaries, cross-student isolation, rate limiter. Run after 0001-0008.
-- Rolled back at the end. NOT YET EXECUTED by the author.
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
  ('00000000-0000-0000-0000-0000000000a1', 'admin@test.local'), ('00000000-0000-0000-0000-0000000000a2', 'i1@test.local'), ('00000000-0000-0000-0000-0000000000a3', 'i2@test.local'),
  ('00000000-0000-0000-0000-0000000000b1', 's1@test.local'), ('00000000-0000-0000-0000-0000000000b2', 's2@test.local');
update profiles set role = 'super_admin' where id = '00000000-0000-0000-0000-0000000000a1';
update profiles set role = 'instructor' where id in ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000a3');
insert into courses (id, slug, title, is_free, price_minor, status, instructor_id) values
  ('00000000-0000-0000-0000-0000000000c1', 'course-one', 'One', false, 10000, 'published', '00000000-0000-0000-0000-0000000000a2'),
  ('00000000-0000-0000-0000-0000000000c2', 'course-two', 'Two', false, 10000, 'draft', '00000000-0000-0000-0000-0000000000a3');
insert into sections (id, course_id, title) values ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000c1', 'S1'), ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000c2', 'S2');
insert into lessons (id, course_id, section_id, title, type, published) values
  ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000e1', 'L1', 'text', true),
  ('00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000e2', 'L2', 'text', false);
-- data that belongs to student 2
insert into enrollments (user_id, course_id, source) values ('00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000c1', 'manual_grant');
insert into orders (id, user_id, course_id, subtotal_minor, total_minor, currency, method, status) values
  ('00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000c1', 10000, 10000, 'EGP', 'online', 'pending'),
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000c1', 10000, 10000, 'EGP', 'online', 'pending');
insert into notifications (user_id, kind, title) values ('00000000-0000-0000-0000-0000000000b2', 'x', 'private');
insert into lesson_progress (user_id, lesson_id, completed_at) values ('00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000f1', now());

do $$
declare i1 constant uuid := '00000000-0000-0000-0000-0000000000a2'; i2 constant uuid := '00000000-0000-0000-0000-0000000000a3'; adm constant uuid := '00000000-0000-0000-0000-0000000000a1';
  s1 constant uuid := '00000000-0000-0000-0000-0000000000b1'; s2 constant uuid := '00000000-0000-0000-0000-0000000000b2';
  C1 constant uuid := '00000000-0000-0000-0000-0000000000c1'; C2 constant uuid := '00000000-0000-0000-0000-0000000000c2';
  n int; r boolean;
begin
  -- ---------- TEST 4: instructor manages ONLY assigned courses ----------
  perform tst.as_user(i1);
  update lessons set title = 'Edited' where course_id = C1; get diagnostics n = row_count; assert n = 1, 'instructor cannot edit own lesson';
  update courses set title = 'One edited' where id = C1; get diagnostics n = row_count; assert n = 1, 'instructor cannot edit own course text';
  assert tst.fails($q$ update courses set price_minor = 1 where id = '00000000-0000-0000-0000-0000000000c1' $q$, 'only administrators'), 'instructor changed price';
  assert tst.fails($q$ update courses set status = 'archived' where id = '00000000-0000-0000-0000-0000000000c1' $q$, 'only administrators'), 'instructor changed status';
  assert tst.fails($q$ update courses set instructor_id = null where id = '00000000-0000-0000-0000-0000000000c1' $q$, 'only administrators'), 'instructor changed ownership';
  select count(*) into n from courses where id = C2; assert n = 0, 'instructor sees another instructors draft';
  update lessons set title = 'Hacked' where course_id = C2; get diagnostics n = row_count; assert n = 0, 'instructor edited a foreign lesson';
  assert tst.fails($q$ insert into sections (course_id, title) values ('00000000-0000-0000-0000-0000000000c2', 'x') $q$, 'row-level security'), 'instructor added a section to a foreign course';
  assert tst.fails($q$ insert into courses (slug, title, price_minor) values ('new-one', 'x', 100) $q$, 'row-level security'), 'instructor created a course';
  assert tst.fails($q$ update profiles set role = 'super_admin' where id = '00000000-0000-0000-0000-0000000000a2' $q$, 'not allowed'), 'instructor promoted self';
  select count(*) into n from course_students(C1); assert n = 1, 'instructor cannot list own students';
  assert tst.fails($q$ select * from course_students('00000000-0000-0000-0000-0000000000c2') $q$, 'not allowed'), 'instructor listed a foreign course';
  select count(*) into n from audit_logs; assert n = 0, 'instructor read the audit log';
  select count(*) into n from orders; assert n = 0, 'instructor read orders (payments are admin-only)';
  select count(*) into n from profiles where id <> i1; assert n = 0, 'instructor read other profiles directly (emails/phones)';
  raise notice 'PASS TEST 4 instructor boundaries';

  -- ---------- TEST 16: students cannot read or modify each other''s data ----------
  perform tst.as_user(s1);
  select count(*) into n from orders where user_id = s2; assert n = 0, 'read another student order';
  select count(*) into n from enrollments where user_id = s2; assert n = 0, 'read another student enrollment';
  select count(*) into n from notifications where user_id = s2; assert n = 0, 'read another student notification';
  select count(*) into n from lesson_progress where user_id = s2; assert n = 0, 'read another student progress';
  select count(*) into n from profiles where id = s2; assert n = 0, 'read another student profile';
  update profiles set full_name = 'x' where id = s2; get diagnostics n = row_count; assert n = 0, 'modified another profile';
  update orders set total_minor = 1, status = 'paid' where id = '00000000-0000-0000-0000-0000000000d1'; get diagnostics n = row_count; assert n = 0, 'student modified own order';
  update orders set status = 'cancelled' where id = '00000000-0000-0000-0000-0000000000d2'; get diagnostics n = row_count; assert n = 0, 'modified another order';
  delete from enrollments where user_id = s2; get diagnostics n = row_count; assert n = 0, 'deleted another enrollment';
  assert tst.fails($q$ insert into enrollments (user_id, course_id, source) values ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000c1', 'purchase') $q$, 'row-level security'), 'student self-enrolled';
  assert tst.fails($q$ select log_audit('x', 'y', 'z') $q$, 'not allowed'), 'student wrote an audit entry';
  assert tst.fails($q$ select * from rate_limits $q$, 'permission denied'), 'student read rate_limits';
  raise notice 'PASS TEST 16 cross-student isolation';

  -- ---------- rate limiter (service/owner only) ----------
  assert tst.fails($q$ select hit_rate_limit('k', 5, 60) $q$, 'permission denied'), 'client called the limiter';
  perform tst.as_owner();
  select hit_rate_limit('t:1', 2, 60) into r; assert r, 'first hit blocked';
  select hit_rate_limit('t:1', 2, 60) into r; assert r, 'second hit blocked';
  select hit_rate_limit('t:1', 2, 60) into r; assert not r, 'third hit allowed';
  update rate_limits set window_start = now() - interval '2 minutes' where key = 't:1';
  select hit_rate_limit('t:1', 2, 60) into r; assert r, 'window did not reset';
  assert tst.fails($q$ select hit_rate_limit('t:2', 0, 60) $q$, 'bad limit'), 'zero limit accepted';
  raise notice 'PASS rate limiter';

  -- ---------- admin still sees everything it should ----------
  perform tst.as_user(adm);
  select count(*) into n from orders; assert n = 2, 'admin cannot read orders';
  select count(*) into n from course_students(C2); assert n = 0;
  raise notice 'PASS admin visibility';
end $$;
rollback;
