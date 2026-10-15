-- Row Level Security checks. Run in Supabase SQL Editor. Everything is rolled back at the end.
-- NOT YET EXECUTED by the author: report any failure.
begin;
create schema tst;
grant usage on schema tst to anon, authenticated;

create function tst.as_user(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;

create function tst.as_owner() returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
end $$;

-- fixtures (profiles are created by the sign-up trigger)
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'admin@test.local'),
  ('00000000-0000-0000-0000-0000000000b1', 'stu1@test.local'),
  ('00000000-0000-0000-0000-0000000000b2', 'stu2@test.local');
update profiles set role = 'super_admin' where id = '00000000-0000-0000-0000-0000000000a1';

insert into courses (id, slug, title, is_free, price_minor, status)
  values ('00000000-0000-0000-0000-0000000000c1', 'paid-test', 'Paid', false, 10000, 'published');
insert into sections (id, course_id, title) values ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000c1', 'S');
insert into lessons (course_id, section_id, title, type, published)
  values ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000d1', 'Locked', 'text', true);

do $$
declare n int; r user_role;
begin
  -- new sign-ups are students
  select role into r from profiles where id = '00000000-0000-0000-0000-0000000000b1';
  assert r = 'student', 'sign-up must create a student';
  raise notice 'PASS signup creates student';

  -- student cannot promote self
  perform tst.as_user('00000000-0000-0000-0000-0000000000b1');
  begin
    update profiles set role = 'super_admin' where id = '00000000-0000-0000-0000-0000000000b1';
    assert false, 'student promoted themselves';
  exception when others then
    if sqlerrm = 'student promoted themselves' then raise; end if;
  end;
  perform tst.as_owner();
  select role into r from profiles where id = '00000000-0000-0000-0000-0000000000b1';
  assert r = 'student', 'role changed';
  raise notice 'PASS student cannot self-promote';

  -- student cannot read another student''s profile
  perform tst.as_user('00000000-0000-0000-0000-0000000000b1');
  select count(*) into n from profiles where id = '00000000-0000-0000-0000-0000000000b2';
  assert n = 0, 'read another profile';
  raise notice 'PASS cannot read other profile';

  -- unenrolled student cannot read a paid lesson
  select count(*) into n from lessons where course_id = '00000000-0000-0000-0000-0000000000c1';
  assert n = 0, 'paid lesson visible without enrollment';
  raise notice 'PASS paid lesson hidden without enrollment';

  -- student cannot enroll themselves
  begin
    insert into enrollments (user_id, course_id, source) values ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000c1', 'purchase');
    assert false, 'self-enrollment succeeded';
  exception when others then
    if sqlerrm = 'self-enrollment succeeded' then raise; end if;
  end;
  raise notice 'PASS cannot self-enroll';

  -- student cannot call fulfill_order
  begin
    perform fulfill_order('00000000-0000-0000-0000-000000000000', 'purchase');
    assert false, 'fulfill_order callable by student';
  exception when others then
    if sqlerrm = 'fulfill_order callable by student' then raise; end if;
  end;
  raise notice 'PASS fulfill_order not callable by students';

  -- after a legitimate enrollment (made by owner), the lesson becomes visible
  perform tst.as_owner();
  insert into enrollments (user_id, course_id, source) values ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000c1', 'manual_grant');
  perform tst.as_user('00000000-0000-0000-0000-0000000000b1');
  select count(*) into n from lessons where course_id = '00000000-0000-0000-0000-0000000000c1';
  assert n = 1, 'enrolled student cannot see lesson';
  raise notice 'PASS enrolled student sees lesson';

  -- the other student still cannot
  perform tst.as_user('00000000-0000-0000-0000-0000000000b2');
  select count(*) into n from lessons where course_id = '00000000-0000-0000-0000-0000000000c1';
  assert n = 0, 'non-enrolled student sees lesson';
  raise notice 'PASS other student still blocked';
end $$;

rollback;
