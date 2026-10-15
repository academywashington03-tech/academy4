-- Phase 8 checks (run after 0001-0006). Rolled back at the end. NOT YET EXECUTED by the author.
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
  ('00000000-0000-0000-0000-0000000000a1', 'admin@test.local'), ('00000000-0000-0000-0000-0000000000b1', 's1@test.local'),
  ('00000000-0000-0000-0000-0000000000b2', 's2@test.local');
update profiles set role = 'super_admin' where id = '00000000-0000-0000-0000-0000000000a1';
update profiles set full_name = 'Student One' where id = '00000000-0000-0000-0000-0000000000b1';
insert into courses (id, slug, title, is_free, price_minor, status, certificate_enabled) values
  ('00000000-0000-0000-0000-0000000000c1', 'cert-course', 'Cert Course', true, 0, 'published', true),
  ('00000000-0000-0000-0000-0000000000c2', 'nocert-course', 'No Cert', true, 0, 'published', false);
insert into sections (id, course_id, title) values
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000c1', 'S'), ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000c2', 'S');
insert into lessons (id, course_id, section_id, title, type, published) values
  ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000e1', 'Read', 'text', true),
  ('00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000e1', 'Quiz', 'quiz', true),
  ('00000000-0000-0000-0000-0000000000f3', '00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000e2', 'Read2', 'text', true);
insert into quizzes (id, course_id, lesson_id, title, pass_score, max_attempts, shuffle) values
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000f2', 'Quiz', 70, 2, true);

do $$
declare quiz constant uuid := '00000000-0000-0000-0000-0000000000d1'; C1 constant uuid := '00000000-0000-0000-0000-0000000000c1'; C2 constant uuid := '00000000-0000-0000-0000-0000000000c2';
  L1 constant uuid := '00000000-0000-0000-0000-0000000000f1'; L2 constant uuid := '00000000-0000-0000-0000-0000000000f2'; L3 constant uuid := '00000000-0000-0000-0000-0000000000f3';
  s1 constant uuid := '00000000-0000-0000-0000-0000000000b1'; s2 constant uuid := '00000000-0000-0000-0000-0000000000b2'; adm constant uuid := '00000000-0000-0000-0000-0000000000a1';
  a uuid; r record; n int; cert_no text; no2 text; answers jsonb; wrong jsonb; txt text; qs jsonb;
begin
  -- ---------- authoring ----------
  perform tst.as_user(s2);
  assert tst.fails($q$ select save_question('00000000-0000-0000-0000-0000000000d1', 'mcq', 'Prompt?', null, '["a","b"]'::jsonb, 0) $q$, 'not allowed'), 'student authored a question';
  perform tst.as_user(adm);
  perform save_question(quiz, 'mcq', 'Capital of Egypt?', 'Cairo is the capital', '["Cairo","Alexandria","Aswan"]'::jsonb, 0);
  perform save_question(quiz, 'true_false', 'The Nile is in Egypt', null, '["True","False"]'::jsonb, 0);
  assert tst.fails($q$ select save_question('00000000-0000-0000-0000-0000000000d1', 'mcq', 'Bad?', null, '["a","b"]'::jsonb, 5) $q$, 'bad correct index'), 'out-of-range correct index';
  assert tst.fails($q$ select save_question('00000000-0000-0000-0000-0000000000d1', 'mcq', 'Bad?', null, '["only"]'::jsonb, 0) $q$, 'bad option count'), 'one option accepted';
  raise notice 'PASS authoring is manager-only and validated';

  -- ---------- answers are never exposed ----------
  perform tst.as_user(s1);
  perform enroll_free(C1);
  select count(*) into n from quiz_options; assert n = 0, 'student can read quiz_options';
  select count(*) into n from quiz_questions; assert n = 0, 'student can read quiz_questions';
  a := start_quiz(quiz);
  assert start_quiz(quiz) = a, 'open attempt must be resumed, not duplicated';
  select jsonb_agg(to_jsonb(x)) into qs from quiz_attempt_questions(a) x;
  txt := qs::text; assert txt not like '%is_correct%' and txt not like '%correct%', 'questions leak the correct answer';
  assert jsonb_array_length(qs) = 2;
  raise notice 'PASS correct answers never reach the student before submission';

  -- ---------- grading happens in the DB ----------
  perform tst.as_owner();
  select jsonb_object_agg(q.id::text, o.id) into answers from quiz_questions q join quiz_options o on o.question_id = q.id and o.is_correct where q.quiz_id = quiz;
  select jsonb_object_agg(q.id::text, o.id) into wrong from quiz_questions q join quiz_options o on o.question_id = q.id and not o.is_correct where q.quiz_id = quiz;
  perform tst.as_user(s1);
  select * into r from submit_quiz(a, wrong); assert r.score = 0 and not r.passed and r.correct = 0, 'wrong answers graded wrong';
  assert tst.fails(format($q$ select * from submit_quiz(%L, '{}'::jsonb) $q$, a), 'already submitted'), 'attempt submitted twice';
  select count(*) into n from lesson_progress where user_id = s1 and lesson_id = L2 and completed_at is not null; assert n = 0, 'failed quiz completed its lesson';
  -- option borrowed from a different question must count as wrong
  a := start_quiz(quiz);
  perform tst.as_owner();
  select jsonb_object_agg(q.id::text, (select o.id from quiz_options o where o.is_correct and o.question_id <> q.id limit 1)) into answers from quiz_questions q where q.quiz_id = quiz;
  perform tst.as_user(s1);
  select * into r from submit_quiz(a, answers); assert r.score = 0, 'foreign options were accepted';
  assert tst.fails($q$ select start_quiz('00000000-0000-0000-0000-0000000000d1') $q$, 'attempts exhausted'), 'attempt limit not enforced';
  raise notice 'PASS server-side grading, no resubmission, foreign options rejected, attempt limit';

  -- ---------- completion rules + certificate ----------
  assert try_issue_certificate(C1) is null, 'certificate issued before requirements';
  perform tst.as_owner();
  update quizzes set max_attempts = 5 where id = quiz;
  select jsonb_object_agg(q.id::text, o.id) into answers from quiz_questions q join quiz_options o on o.question_id = q.id and o.is_correct where q.quiz_id = quiz;
  perform tst.as_user(s1);
  a := start_quiz(quiz);
  select * into r from submit_quiz(a, answers || '{"junk":"x","role":"admin"}'::jsonb); assert r.score = 100 and r.passed, 'correct answers not passed';
  select count(*) into n from lesson_progress where user_id = s1 and lesson_id = L2 and completed_at is not null; assert n = 1, 'passed quiz did not complete its lesson';
  assert try_issue_certificate(C1) is null, 'certificate issued with a required lesson still open';
  perform mark_lesson_complete(L1);
  cert_no := try_issue_certificate(C1);
  assert cert_no ~ '^WA-[0-9]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$', 'certificate number format';
  no2 := try_issue_certificate(C1); assert no2 = cert_no, 'second call must return the same certificate';
  select count(*) into n from certificates where user_id = s1; assert n = 1, 'duplicate certificate';
  raise notice 'PASS TEST 14 certificate issued only after requirements (lessons + required quiz)';

  perform tst.as_user(s1);
  perform enroll_free(C2); perform mark_lesson_complete(L3);
  assert try_issue_certificate(C2) is null, 'certificate for a course without certificates';
  perform tst.as_user(s2);
  assert try_issue_certificate(C1) is null, 'certificate for a non-enrolled user';
  raise notice 'PASS no certificate for disabled courses or non-enrolled users';

  -- ---------- public verification ----------
  perform tst.as_anon();
  select * into r from verify_certificate(lower(cert_no)); assert r.student_name = 'Student One' and r.course_title = 'Cert Course' and not r.revoked, 'verify failed';
  select count(*) into n from verify_certificate('WA-2026-0000-0000-0000'); assert n = 0, 'unknown number verified';
  select count(*) into n from certificates; assert n = 0, 'anon can read certificates table directly';
  raise notice 'PASS TEST 15 public verification returns only the certificate facts';

  perform tst.as_user(s1);
  select count(*) into n from certificates; assert n = 1, 'student sees own certificate only';
  assert tst.fails(format($q$ select revoke_certificate((select id from certificates limit 1), 'x') $q$), 'not allowed'), 'student revoked certificate';
  perform tst.as_user(adm);
  perform revoke_certificate((select id from certificates where certificate_no = cert_no), 'test');
  perform tst.as_anon();
  select * into r from verify_certificate(cert_no); assert r.revoked, 'revocation not shown';
  perform tst.as_user(s1);
  assert try_issue_certificate(C1) is null, 'revoked certificate returned as valid';
  raise notice 'PASS revocation';
end $$;
rollback;
