-- Phase 10: rate limiting store + instructor view of their own students (names/progress only).

create table if not exists rate_limits (
  key text primary key,
  window_start timestamptz not null default now(),
  hits int not null default 0
);
alter table rate_limits enable row level security;       -- no policies: only the service role can touch it

-- Fixed-window counter. Returns TRUE while the caller is still within the limit.
create or replace function hit_rate_limit(p_key text, p_limit int, p_window int) returns boolean
language plpgsql security definer set search_path = public as $$
declare h int;
begin
  if p_limit < 1 or p_window < 1 then raise exception 'bad limit'; end if;
  insert into rate_limits as r (key, window_start, hits) values (left(p_key, 200), now(), 1)
  on conflict (key) do update set
    window_start = case when r.window_start < now() - make_interval(secs => p_window) then now() else r.window_start end,
    hits = case when r.window_start < now() - make_interval(secs => p_window) then 1 else r.hits + 1 end
  returning hits into h;
  if random() < 0.01 then delete from rate_limits where window_start < now() - interval '1 day'; end if;   -- housekeeping
  return h <= p_limit;
end $$;
revoke all on function hit_rate_limit(text, int, int) from public, anon, authenticated;

-- Instructors (and admins) see who is enrolled in THEIR courses: name + progress only (no email/phone).
create or replace function course_students(p_course uuid)
returns table (user_id uuid, full_name text, enrolled_at timestamptz, expires_at timestamptz, revoked boolean,
               lessons_total int, lessons_done int, last_seen timestamptz, quizzes_total int, quizzes_passed int)
language plpgsql stable security definer set search_path = public as $$
begin
  if not manages_course(p_course) then raise exception 'not allowed'; end if;
  return query
  select e.user_id, p.full_name, e.created_at, e.expires_at, e.revoked_at is not null,
    (select count(*) from lessons l where l.course_id = p_course and l.published and l.required_for_completion)::int,
    (select count(*) from lesson_progress lp join lessons l on l.id = lp.lesson_id
       where lp.user_id = e.user_id and l.course_id = p_course and l.published and l.required_for_completion and lp.completed_at is not null)::int,
    (select max(lp.last_seen_at) from lesson_progress lp join lessons l on l.id = lp.lesson_id where lp.user_id = e.user_id and l.course_id = p_course),
    (select count(*) from quizzes q where q.course_id = p_course)::int,
    (select count(*) from quizzes q where q.course_id = p_course and exists (select 1 from quiz_attempts a where a.quiz_id = q.id and a.user_id = e.user_id and a.passed))::int
  from enrollments e join profiles p on p.id = e.user_id
  where e.course_id = p_course order by e.created_at desc;
end $$;
revoke all on function course_students(uuid) from public, anon;
grant execute on function course_students(uuid) to authenticated;     -- manages_course() check is inside
