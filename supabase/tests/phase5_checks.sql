-- Phase 5 checks (run after 0001-0003). Rolled back at the end. NOT YET EXECUTED by the author.
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
insert into courses (id, slug, title, is_free, price_minor, status) values
  ('00000000-0000-0000-0000-0000000000f1', 'free-test', 'Free', true, 0, 'published'),
  ('00000000-0000-0000-0000-0000000000f2', 'paid-test2', 'Paid', false, 10000, 'published');
insert into sections (id, course_id, title) values
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000f1', 'S1'),
  ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000f2', 'S2');
insert into lessons (id, course_id, section_id, title, type, published) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000e1', 'L-free', 'text', true),
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-0000000000e2', 'L-paid', 'text', true);

do $$
declare n int;
begin
  perform tst.as_user('00000000-0000-0000-0000-0000000000b1');

  -- cannot enroll in a paid course through enroll_free
  begin perform enroll_free('00000000-0000-0000-0000-0000000000f2'); assert false, 'enrolled in paid course';
  exception when others then if sqlerrm = 'enrolled in paid course' then raise; end if; end;
  raise notice 'PASS enroll_free rejects paid course';

  -- free enrollment works and is idempotent
  perform enroll_free('00000000-0000-0000-0000-0000000000f1');
  perform enroll_free('00000000-0000-0000-0000-0000000000f1');
  select count(*) into n from enrollments where course_id = '00000000-0000-0000-0000-0000000000f1';
  assert n = 1, 'free enrollment count';
  raise notice 'PASS free enrollment, no duplicates';

  -- progress: allowed on the enrolled course, refused on the paid one
  perform mark_lesson_complete('00000000-0000-0000-0000-0000000000a1');
  begin perform mark_lesson_complete('00000000-0000-0000-0000-0000000000a2'); assert false, 'completed paid lesson';
  exception when others then if sqlerrm = 'completed paid lesson' then raise; end if; end;
  raise notice 'PASS progress requires access';

  -- my_progress reflects 1/1
  select count(*) into n from my_progress() where total = 1 and done = 1;
  assert n = 1, 'my_progress';
  raise notice 'PASS my_progress';

  -- direct writes to progress are not possible for students
  begin insert into lesson_progress (user_id, lesson_id, completed_at) values ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a2', now());
    assert false, 'direct progress insert';
  exception when others then if sqlerrm = 'direct progress insert' then raise; end if; end;
  raise notice 'PASS no direct progress writes';

  -- student 2 cannot see student 1 progress
  perform tst.as_user('00000000-0000-0000-0000-0000000000b2');
  select count(*) into n from lesson_progress;
  assert n = 0, 'progress leak';
  select count(*) into n from enrollments;
  assert n = 0, 'enrollment leak';
  raise notice 'PASS no cross-student leakage';

  -- outline of a published course is visible, without bodies
  select count(*) into n from course_outline('00000000-0000-0000-0000-0000000000f2');
  assert n = 1, 'outline';
  raise notice 'PASS outline visible';
end $$;
rollback;
