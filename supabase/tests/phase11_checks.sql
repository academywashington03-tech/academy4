-- Phase 11 checks: public homepage content. Run after 0001-0009. Rolled back at the end. NOT YET EXECUTED by the author.
begin;
create schema tst;
grant usage on schema tst to anon, authenticated;
create function tst.as_user(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;
create function tst.as_anon() returns void language plpgsql as $$
begin perform set_config('request.jwt.claims', '', true); execute 'set local role anon'; end $$;
create function tst.as_owner() returns void language plpgsql as $$
begin execute 'reset role'; perform set_config('request.jwt.claims', '', true); end $$;
create function tst.fails(q text, needle text) returns boolean language plpgsql as $$
begin execute q; return false; exception when others then return sqlerrm like '%' || needle || '%'; end $$;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'admin@test.local'), ('00000000-0000-0000-0000-0000000000a2', 'teacher@test.local'),
  ('00000000-0000-0000-0000-0000000000a3', 'idle-teacher@test.local'), ('00000000-0000-0000-0000-0000000000b1', 's1@test.local');
update profiles set role = 'super_admin' where id = '00000000-0000-0000-0000-0000000000a1';
update profiles set role = 'instructor', bio = 'Teacher bio' where id = '00000000-0000-0000-0000-0000000000a2';
update profiles set role = 'instructor' where id = '00000000-0000-0000-0000-0000000000a3';
insert into courses (id, slug, title, is_free, price_minor, status, instructor_id) values
  ('00000000-0000-0000-0000-0000000000c1', 'pop-course', 'Popular', true, 0, 'published', '00000000-0000-0000-0000-0000000000a2'),
  ('00000000-0000-0000-0000-0000000000c2', 'draft-course', 'Draft', true, 0, 'draft', '00000000-0000-0000-0000-0000000000a3');
insert into enrollments (user_id, course_id, source) values ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000c1', 'manual_grant');
insert into testimonials (author_name, body, published) values ('Sara', 'Great course, very clear explanations', true), ('Hidden', 'This one is still a draft entry', false);

do $$
declare n int; v int; cols text;
begin
  perform tst.as_anon();
  select enrollment_count into v from public_courses where slug = 'pop-course'; assert v = 1, 'enrollment_count wrong';
  select count(*) into n from public_courses where slug = 'draft-course'; assert n = 0, 'draft course is public';
  select count(*) into n from testimonials; assert n = 1, 'visitors must see only published testimonials';
  select count(*) into n from public_instructors; assert n = 1, 'only instructors with a published course are public';
  select string_agg(column_name, ',' order by column_name) into cols from information_schema.columns where table_name = 'public_instructors' and table_schema = 'public';
  assert cols = 'bio,full_name,id', 'public_instructors must expose only id, full_name, bio';
  assert tst.fails($q$ insert into testimonials (author_name, body) values ('Hack', 'visitor wrote this entry') $q$, 'row-level security'), 'anon inserted a testimonial';
  raise notice 'PASS visitors see only published testimonials, real instructors, and no personal data';

  perform tst.as_user('00000000-0000-0000-0000-0000000000b1');
  assert tst.fails($q$ insert into testimonials (author_name, body) values ('Stu', 'a student wrote this entry') $q$, 'row-level security'), 'student inserted a testimonial';
  delete from testimonials; get diagnostics n = row_count; assert n = 0, 'student deleted testimonials';
  assert tst.fails($q$ update profiles set bio = repeat('x', 601) where id = '00000000-0000-0000-0000-0000000000b1' $q$, 'check'), 'bio length not enforced';
  raise notice 'PASS students cannot manage testimonials; bio length is bounded';

  perform tst.as_user('00000000-0000-0000-0000-0000000000a1');
  select count(*) into n from testimonials; assert n = 2, 'admin cannot see drafts';
  insert into testimonials (author_name, body, published) values ('Admin entry', 'Added by the administrator here', true);
  update profiles set bio = 'Edited by admin' where id = '00000000-0000-0000-0000-0000000000a3'; get diagnostics n = row_count; assert n = 1;
  raise notice 'PASS administrator manages testimonials and bios';
end $$;
rollback;
