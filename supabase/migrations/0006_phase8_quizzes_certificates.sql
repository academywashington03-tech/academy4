-- Phase 8: quizzes (server-side grading), completion rules, certificates + public verification.
alter table quizzes add column if not exists show_answers boolean not null default true;
alter table quizzes add column if not exists required boolean not null default true;
create unique index if not exists quizzes_one_per_lesson on quizzes (lesson_id) where lesson_id is not null;
alter table quiz_options add column if not exists sort_order int not null default 0;
alter table quiz_attempts add column if not exists correct_count int, add column if not exists total_count int;
alter table certificates add column if not exists student_name text, add column if not exists course_title text,
  add column if not exists instructor_name text, add column if not exists revoked_at timestamptz;

-- ---------- Question authoring (atomic; exactly one correct option) ----------
create or replace function save_question(p_quiz uuid, p_kind text, p_prompt text, p_explanation text, p_options jsonb, p_correct int)
returns uuid language plpgsql security definer set search_path = public as $$
declare cid uuid; n int; qid uuid; i int; lbl text;
begin
  select course_id into cid from quizzes where id = p_quiz;
  if not found or not manages_course(cid) then raise exception 'not allowed'; end if;
  if p_kind not in ('mcq', 'true_false') then raise exception 'bad kind'; end if;
  if length(trim(coalesce(p_prompt, ''))) < 3 or length(p_prompt) > 1000 then raise exception 'bad prompt'; end if;
  if jsonb_typeof(p_options) <> 'array' then raise exception 'bad options'; end if;
  n := jsonb_array_length(p_options);
  if (p_kind = 'true_false' and n <> 2) or (p_kind = 'mcq' and (n < 2 or n > 8)) then raise exception 'bad option count'; end if;
  if p_correct is null or p_correct < 0 or p_correct >= n then raise exception 'bad correct index'; end if;
  insert into quiz_questions (quiz_id, kind, prompt, explanation, sort_order)
  values (p_quiz, p_kind, trim(p_prompt), nullif(left(trim(coalesce(p_explanation, '')), 1000), ''),
          coalesce((select max(sort_order) + 1 from quiz_questions where quiz_id = p_quiz), 0)) returning id into qid;
  for i in 0 .. n - 1 loop
    lbl := trim(coalesce(p_options ->> i, ''));
    if lbl = '' or length(lbl) > 300 then raise exception 'bad option label'; end if;
    insert into quiz_options (question_id, label, is_correct, sort_order) values (qid, lbl, i = p_correct, i);
  end loop;
  insert into audit_logs (actor_id, action, entity, entity_id, details) values (auth.uid(), 'question_added', 'quiz', p_quiz::text, jsonb_build_object('question', qid));
  return qid;
end $$;
revoke all on function save_question(uuid, text, text, text, jsonb, int) from public, anon;
grant execute on function save_question(uuid, text, text, text, jsonb, int) to authenticated;

-- ---------- Taking a quiz ----------
create or replace function start_quiz(p_quiz uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare q quizzes; a uuid; n int;
begin
  select * into q from quizzes where id = p_quiz;
  if not found or auth.uid() is null or not has_access(q.course_id) then raise exception 'not allowed'; end if;
  if q.lesson_id is not null and not exists (select 1 from lessons where id = q.lesson_id and published) then raise exception 'not available'; end if;
  if not exists (select 1 from quiz_questions where quiz_id = p_quiz) then raise exception 'no questions'; end if;
  select id into a from quiz_attempts where quiz_id = p_quiz and user_id = auth.uid() and submitted_at is null limit 1;
  if found then return a; end if;                                    -- resume the open attempt (no extra attempt used)
  select count(*) into n from quiz_attempts where quiz_id = p_quiz and user_id = auth.uid() and submitted_at is not null;
  if q.max_attempts is not null and n >= q.max_attempts then raise exception 'attempts exhausted'; end if;
  insert into quiz_attempts (quiz_id, user_id) values (p_quiz, auth.uid()) returning id into a;
  return a;
end $$;

-- Questions for an open attempt. NEVER includes is_correct.
create or replace function quiz_attempt_questions(p_attempt uuid)
returns table (question_id uuid, kind text, prompt text, options jsonb)
language plpgsql stable security definer set search_path = public as $$
declare q quizzes; a quiz_attempts;
begin
  select * into a from quiz_attempts where id = p_attempt and user_id = auth.uid() and submitted_at is null;
  if not found then raise exception 'not allowed'; end if;
  select * into q from quizzes where id = a.quiz_id;
  return query
    select qq.id, qq.kind, qq.prompt,
      (select jsonb_agg(jsonb_build_object('id', o.id, 'label', o.label)
          order by case when qq.kind = 'mcq' and q.shuffle then md5(p_attempt::text || o.id::text) else lpad(o.sort_order::text, 4, '0') end)
         from quiz_options o where o.question_id = qq.id)
    from quiz_questions qq where qq.quiz_id = a.quiz_id
    order by case when q.shuffle then md5(p_attempt::text || qq.id::text) else lpad(qq.sort_order::text, 6, '0') end;
end $$;

-- Grading happens HERE. The browser only says which option it picked for each question.
create or replace function submit_quiz(p_attempt uuid, p_answers jsonb)
returns table (score int, passed boolean, correct int, total int)
language plpgsql security definer set search_path = public as $$
declare a quiz_attempts; q quizzes; qq record; raw text; opt uuid; ok boolean; c int := 0; t int := 0; s int; p boolean;
begin
  select * into a from quiz_attempts where id = p_attempt and user_id = auth.uid() for update;
  if not found then raise exception 'not allowed'; end if;
  if a.submitted_at is not null then raise exception 'already submitted'; end if;
  select * into q from quizzes where id = a.quiz_id;
  if not has_access(q.course_id) then raise exception 'not allowed'; end if;
  if jsonb_typeof(p_answers) <> 'object' then raise exception 'bad answers'; end if;
  for qq in select id from quiz_questions where quiz_id = a.quiz_id loop
    t := t + 1; opt := null; ok := false;
    raw := p_answers ->> qq.id::text;
    if raw ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      select o.id, o.is_correct into opt, ok from quiz_options o where o.id = raw::uuid and o.question_id = qq.id;   -- must belong to THIS question
    end if;
    ok := coalesce(ok, false);
    insert into quiz_answers (attempt_id, question_id, option_id, is_correct) values (p_attempt, qq.id, opt, ok);
    if ok then c := c + 1; end if;
  end loop;
  if t = 0 then raise exception 'no questions'; end if;
  s := round(c * 100.0 / t); p := s >= q.pass_score;
  update quiz_attempts set submitted_at = now(), score_percent = s, passed = p, correct_count = c, total_count = t where id = p_attempt;
  if p and q.lesson_id is not null then
    insert into lesson_progress (user_id, lesson_id, completed_at, last_seen_at) values (auth.uid(), q.lesson_id, now(), now())
    on conflict (user_id, lesson_id) do update set completed_at = coalesce(lesson_progress.completed_at, now()), last_seen_at = now();
  end if;
  return query select s, p, c, t;
end $$;

-- Review after submission (only if the author allows showing answers).
create or replace function quiz_review(p_attempt uuid)
returns table (prompt text, explanation text, chosen text, correct_label text, is_correct boolean)
language plpgsql stable security definer set search_path = public as $$
declare a quiz_attempts; q quizzes;
begin
  select * into a from quiz_attempts where id = p_attempt and user_id = auth.uid() and submitted_at is not null;
  if not found then raise exception 'not allowed'; end if;
  select * into q from quizzes where id = a.quiz_id;
  if not q.show_answers then return; end if;
  return query
    select qq.prompt, qq.explanation, co.label, (select o.label from quiz_options o where o.question_id = qq.id and o.is_correct limit 1), ans.is_correct
    from quiz_questions qq
    join quiz_answers ans on ans.question_id = qq.id and ans.attempt_id = p_attempt
    left join quiz_options co on co.id = ans.option_id
    where qq.quiz_id = a.quiz_id order by qq.sort_order;
end $$;
revoke all on function start_quiz(uuid), quiz_attempt_questions(uuid), submit_quiz(uuid, jsonb), quiz_review(uuid) from public, anon;
grant execute on function start_quiz(uuid), quiz_attempt_questions(uuid), submit_quiz(uuid, jsonb), quiz_review(uuid) to authenticated;

-- ---------- Completion rules + certificates ----------
-- Eligible = every required published lesson completed AND every required quiz passed.
create or replace function my_course_completion(p_course uuid)
returns table (lessons_total int, lessons_done int, quizzes_total int, quizzes_passed int, eligible boolean)
language sql stable security definer set search_path = public as $$
  with l as (
    select (select count(*) from lessons x where x.course_id = p_course and x.published and x.required_for_completion)::int as total,
           (select count(*) from lesson_progress lp join lessons x on x.id = lp.lesson_id
              where lp.user_id = auth.uid() and x.course_id = p_course and x.published and x.required_for_completion and lp.completed_at is not null)::int as done),
       z as (
    select (select count(*) from quizzes q where q.course_id = p_course and q.required
              and (q.lesson_id is null or exists (select 1 from lessons x where x.id = q.lesson_id and x.published)))::int as total,
           (select count(*) from quizzes q where q.course_id = p_course and q.required
              and (q.lesson_id is null or exists (select 1 from lessons x where x.id = q.lesson_id and x.published))
              and exists (select 1 from quiz_attempts a where a.quiz_id = q.id and a.user_id = auth.uid() and a.passed))::int as passed)
  select l.total, l.done, z.total, z.passed, (l.total > 0 and l.done = l.total and z.passed = z.total) from l, z $$;
revoke all on function my_course_completion(uuid) from public, anon;
grant execute on function my_course_completion(uuid) to authenticated;

-- Issues (or returns the existing) certificate when the course's completion rules are met. Returns NULL otherwise.
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
    select * into existing from certificates where user_id = auth.uid() and course_id = p_course;   -- concurrent issue
    if found then return existing.certificate_no; end if;
    tries := tries + 1; if tries > 5 then return null; end if;
  end loop;
  return cert_no;
end $$;
revoke all on function try_issue_certificate(uuid) from public, anon;
grant execute on function try_issue_certificate(uuid) to authenticated;

-- Public verification: returns only what the certificate itself shows.
create or replace function verify_certificate(p_no text)
returns table (certificate_no text, student_name text, course_title text, instructor_name text, issued_at timestamptz, revoked boolean)
language sql stable security definer set search_path = public as $$
  select c.certificate_no, c.student_name, c.course_title, c.instructor_name, c.issued_at, c.revoked_at is not null
  from certificates c where c.certificate_no = upper(trim(p_no)) $$;
grant execute on function verify_certificate(text) to anon, authenticated;

create or replace function revoke_certificate(p_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'not allowed'; end if;
  update certificates set revoked_at = now() where id = p_id and revoked_at is null;
  insert into audit_logs (actor_id, action, entity, entity_id, details) values (auth.uid(), 'certificate_revoked', 'certificate', p_id::text, jsonb_build_object('reason', left(coalesce(p_reason, ''), 300)));
end $$;
revoke all on function revoke_certificate(uuid, text) from public, anon;
grant execute on function revoke_certificate(uuid, text) to authenticated;
