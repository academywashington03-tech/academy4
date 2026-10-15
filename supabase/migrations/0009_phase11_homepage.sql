-- Phase 11: public homepage content: popular courses, instructor profiles, admin-managed testimonials.
-- Nothing here is pre-filled: sections appear on the site only when real data exists.

alter table profiles add column if not exists bio text check (bio is null or length(bio) <= 600);

-- Same view as 0003 plus ONE new column at the end (enrollment_count: a number, no personal data).
create or replace view public_courses as
select c.id, c.slug, c.title, c.short_description, c.description, c.cover_url, c.level, c.language,
       c.duration_minutes, c.objectives, c.prerequisites, c.is_free, c.price_minor, c.promo_price_minor,
       c.currency, c.enrollment_open, c.certificate_enabled, c.created_at,
       cat.slug as category_slug, cat.name_ar as category_name_ar, cat.name_en as category_name_en,
       p.full_name as instructor_name,
       (select count(*) from lessons l where l.course_id = c.id and l.published)::int as lesson_count,
       (select count(*) from enrollments e where e.course_id = c.id and e.revoked_at is null)::int as enrollment_count
from courses c
left join categories cat on cat.id = c.category_id
left join profiles p on p.id = c.instructor_id
where c.status = 'published';

-- Instructors who currently teach at least one published course. Exposes name + bio ONLY (no email/phone).
create or replace view public_instructors as
select p.id, p.full_name, p.bio
from profiles p
where p.role = 'instructor' and not p.suspended
  and exists (select 1 from courses c where c.instructor_id = p.id and c.status = 'published');
grant select on public_instructors to anon, authenticated;

create table if not exists testimonials (
  id uuid primary key default gen_random_uuid(),
  author_name text not null check (length(author_name) between 2 and 80),
  body text not null check (length(body) between 10 and 600),
  course_title text check (course_title is null or length(course_title) <= 150),
  published boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
alter table testimonials enable row level security;
create policy t_public_read on testimonials for select using (published or is_admin());
create policy t_admin on testimonials for all using (is_admin()) with check (is_admin());
