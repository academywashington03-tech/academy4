-- Phase 4: profile email, audit helper, course-field protection, storage buckets + policies.

alter table profiles add column if not exists email text;
update profiles p set email = u.email from auth.users u where u.id = p.id and p.email is null;
create index if not exists profiles_email_idx on profiles (lower(email));

create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, full_name, phone, email)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name',''), new.raw_user_meta_data->>'phone', new.email);
  return new;
end $$;

-- Audit helper: privileged users record actions as themselves (actor cannot be spoofed).
create or replace function log_audit(p_action text, p_entity text, p_entity_id text, p_details jsonb default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if coalesce(current_role_of()::text, '') not in ('super_admin', 'instructor') then
    raise exception 'not allowed';
  end if;
  insert into audit_logs (actor_id, action, entity, entity_id, details)
  values (auth.uid(), p_action, p_entity, p_entity_id, p_details);
end $$;
revoke all on function log_audit(text, text, text, jsonb) from public, anon;
grant execute on function log_audit(text, text, text, jsonb) to authenticated;

-- Defense in depth: instructors can edit course content/text but never price, status or ownership.
create or replace function protect_course_fields() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not is_admin() and (
       new.price_minor is distinct from old.price_minor
    or new.promo_price_minor is distinct from old.promo_price_minor
    or new.is_free is distinct from old.is_free
    or new.currency is distinct from old.currency
    or new.status is distinct from old.status
    or new.instructor_id is distinct from old.instructor_id
    or new.slug is distinct from old.slug
    or new.enrollment_open is distinct from old.enrollment_open) then
    raise exception 'only administrators can change price, status, slug or ownership';
  end if;
  new.updated_at = now();
  return new;
end $$;
drop trigger if exists protect_course on courses;
create trigger protect_course before update on courses for each row execute function protect_course_fields();

-- ---------- Storage ----------
create or replace function folder_course_id(object_name text) returns uuid
language sql immutable as $$
  select case when split_part(object_name, '/', 1) ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
              then split_part(object_name, '/', 1)::uuid end $$;

-- NOTE: Supabase's free plan caps single-file size (verify current limit); 50 MB is the bucket ceiling here.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('course-resources', 'course-resources', false, 52428800, array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/zip', 'image/jpeg', 'image/png']),
  ('course-covers', 'course-covers', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy "resources_manage_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'course-resources' and public.manages_course(public.folder_course_id(name)));
create policy "resources_manage_update" on storage.objects for update to authenticated
  using (bucket_id = 'course-resources' and public.manages_course(public.folder_course_id(name)));
create policy "resources_manage_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'course-resources' and public.manages_course(public.folder_course_id(name)));
-- Private files: only managers or enrolled students may create signed URLs / read.
create policy "resources_read" on storage.objects for select to authenticated
  using (bucket_id = 'course-resources' and (public.manages_course(public.folder_course_id(name)) or public.has_access(public.folder_course_id(name))));

create policy "covers_manage_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'course-covers' and public.manages_course(public.folder_course_id(name)));
create policy "covers_manage_update" on storage.objects for update to authenticated
  using (bucket_id = 'course-covers' and public.manages_course(public.folder_course_id(name)));
create policy "covers_manage_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'course-covers' and public.manages_course(public.folder_course_id(name)));
create policy "covers_read" on storage.objects for select using (bucket_id = 'course-covers');
