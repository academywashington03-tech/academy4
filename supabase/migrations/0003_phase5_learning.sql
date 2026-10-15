-- Phase 5: public catalog view, outline, free enrollment, progress tracking.

-- Students keep access to courses/sections they are enrolled in even if the course is later archived.
drop policy if exists c_read on courses;
create policy c_read on courses for select using (status = 'published' or manages_course(id) or has_access(id));
drop policy if exists s_read on sections;
create policy s_read on sections for select using (
  exists (select 1 from courses c where c.id = course_id and c.status = 'published')
  or manages_course(course_id) or has_access(course_id));

-- Public catalog: published courses only, with instructor display name (no emails/phones).
-- Intentionally runs with the view owner's rights so visitors can read the instructor's name.
create or replace view public_courses as
select c.id, c.slug, c.title, c.short_description, c.description, c.cover_url, c.level, c.language,
       c.duration_minutes, c.objectives, c.prerequisites, c.is_free, c.price_minor, c.promo_price_minor,
       c.currency, c.enrollment_open, c.certificate_enabled, c.created_at,
       cat.slug as category_slug, cat.name_ar as category_name_ar, cat.name_en as category_name_en,
       p.full_name as instructor_name,
       (select count(*) from lessons l where l.course_id = c.id and l.published)::int as lesson_count
from courses c
left join categories cat on cat.id = c.category_id
left join profiles p on p.id = c.instructor_id
where c.status = 'published';
grant select on public_courses to anon, authenticated;

-- Outline: titles only (no video refs / bodies). Visible for published courses, to enrolled students and managers.
create or replace function course_outline(p_course uuid)
returns table (section_id uuid, section_title text, section_order int, lesson_id uuid, lesson_title text,
               kind lesson_type, is_free_preview boolean, required boolean, lesson_order int)
language sql stable security definer set search_path = public as $$
  select s.id, s.title, s.sort_order, l.id, l.title, l.type, l.is_free_preview, l.required_for_completion, l.sort_order
  from sections s
  left join lessons l on l.section_id = s.id and l.published
  where s.course_id = p_course
    and exists (select 1 from courses c where c.id = p_course
                and (c.status = 'published' or has_access(c.id) or manages_course(c.id)))
  order by s.sort_order, l.sort_order $$;
grant execute on function course_outline(uuid) to anon, authenticated;

-- Free enrollment: the ONLY way a student creates an enrollment themselves, and only for free published courses.
create or replace function enroll_free(p_course uuid) returns void
language plpgsql security definer set search_path = public as $$
declare c courses; e enrollments;
begin
  if auth.uid() is null or current_role_of() is null then raise exception 'not allowed'; end if;
  select * into c from courses where id = p_course and status = 'published' and is_free and enrollment_open;
  if not found then raise exception 'course not available'; end if;
  select * into e from enrollments where user_id = auth.uid() and course_id = p_course;
  if found then
    if e.revoked_at is not null then raise exception 'access revoked'; end if;
    return;
  end if;
  insert into enrollments (user_id, course_id, source, expires_at)
  values (auth.uid(), p_course, 'free',
          case when c.access_days is null then null else now() + (c.access_days || ' days')::interval end);
end $$;
revoke all on function enroll_free(uuid) from public, anon;
grant execute on function enroll_free(uuid) to authenticated;

-- Progress writes go through these functions only (they verify access server-side).
create or replace function touch_lesson(p_lesson uuid) returns void
language plpgsql security definer set search_path = public as $$
declare l lessons;
begin
  select * into l from lessons where id = p_lesson and published;
  if not found or auth.uid() is null or not has_access(l.course_id) then return; end if;
  insert into lesson_progress (user_id, lesson_id, last_seen_at) values (auth.uid(), p_lesson, now())
  on conflict (user_id, lesson_id) do update set last_seen_at = now();
  update enrollments set last_lesson_id = p_lesson where user_id = auth.uid() and course_id = l.course_id;
end $$;

create or replace function mark_lesson_complete(p_lesson uuid) returns void
language plpgsql security definer set search_path = public as $$
declare l lessons;
begin
  select * into l from lessons where id = p_lesson and published;
  if not found or auth.uid() is null or not has_access(l.course_id) then raise exception 'not allowed'; end if;
  insert into lesson_progress (user_id, lesson_id, completed_at, last_seen_at) values (auth.uid(), p_lesson, now(), now())
  on conflict (user_id, lesson_id) do update set completed_at = coalesce(lesson_progress.completed_at, now()), last_seen_at = now();
  update enrollments set last_lesson_id = p_lesson where user_id = auth.uid() and course_id = l.course_id;
end $$;

create or replace function my_progress() returns table (course_id uuid, total int, done int)
language sql stable security definer set search_path = public as $$
  select e.course_id,
    (select count(*) from lessons l where l.course_id = e.course_id and l.published and l.required_for_completion)::int,
    (select count(*) from lesson_progress lp join lessons l on l.id = lp.lesson_id
       where lp.user_id = e.user_id and l.course_id = e.course_id and l.published
         and l.required_for_completion and lp.completed_at is not null)::int
  from enrollments e
  where e.user_id = auth.uid() and e.revoked_at is null and (e.expires_at is null or e.expires_at > now()) $$;

revoke all on function touch_lesson(uuid), mark_lesson_complete(uuid), my_progress() from public, anon;
grant execute on function touch_lesson(uuid), mark_lesson_complete(uuid), my_progress() to authenticated;
