-- Washington Academy schema v1. Money in minor units (piastres).
create extension if not exists pgcrypto;

create type user_role as enum ('super_admin','instructor','student');
create type course_status as enum ('draft','published','archived');
create type lesson_type as enum ('video','pdf','text','quiz','resource');
create type order_status as enum ('pending','awaiting_review','paid','failed','cancelled','refunded');
create type payment_method as enum ('online','manual');
create type sub_status as enum ('active','expired','cancelled');
create type enroll_source as enum ('purchase','manual_grant','free','bundle','subscription');

-- profiles
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  phone text,
  role user_role not null default 'student',
  suspended boolean not null default false,
  locale text not null default 'ar',
  created_at timestamptz not null default now()
);

create table categories (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null, name_ar text not null, name_en text,
  sort_order int not null default 0
);

create table courses (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  title text not null, short_description text, description text, cover_url text,
  instructor_id uuid references profiles(id) on delete set null,
  category_id uuid references categories(id) on delete set null,
  objectives text[] default '{}', prerequisites text, level text, duration_minutes int,
  language text not null default 'ar',
  is_free boolean not null default false,
  price_minor int not null default 0 check (price_minor >= 0),
  promo_price_minor int check (promo_price_minor >= 0),
  currency char(3) not null default 'EGP',
  status course_status not null default 'draft',
  enrollment_open boolean not null default true,
  certificate_enabled boolean not null default false,
  access_days int,                 -- null = lifetime
  pass_score int not null default 70,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (is_free or price_minor > 0)
);
create index on courses(status, category_id);

create table course_instructors (   -- extra assignment (instructor manages only these)
  course_id uuid references courses(id) on delete cascade,
  instructor_id uuid references profiles(id) on delete cascade,
  primary key (course_id, instructor_id)
);

create table sections (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references courses(id) on delete cascade,
  title text not null, sort_order int not null default 0
);
create index on sections(course_id, sort_order);

create table lessons (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null references sections(id) on delete cascade,
  course_id uuid not null references courses(id) on delete cascade,
  title text not null, description text,
  type lesson_type not null,
  video_provider text, video_ref text,     -- e.g. 'cloudflare_stream' + video uid
  body text,
  is_free_preview boolean not null default false,
  required_for_completion boolean not null default true,
  published boolean not null default false,
  sort_order int not null default 0
);
create index on lessons(course_id, sort_order);

create table resources (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references courses(id) on delete cascade,
  lesson_id uuid references lessons(id) on delete cascade,
  title text not null, storage_path text not null,   -- private bucket path
  mime_type text not null, size_bytes bigint not null check (size_bytes > 0)
);

create table bundles (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null, title text not null, description text,
  price_minor int not null check (price_minor > 0), currency char(3) not null default 'EGP',
  status course_status not null default 'draft'
);
create table bundle_courses (
  bundle_id uuid references bundles(id) on delete cascade,
  course_id uuid references courses(id) on delete cascade,
  primary key (bundle_id, course_id)
);

create table coupons (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  percent_off int check (percent_off between 1 and 100),
  amount_off_minor int check (amount_off_minor > 0),
  expires_at timestamptz, max_redemptions int, redeemed_count int not null default 0,
  course_id uuid references courses(id) on delete cascade,
  bundle_id uuid references bundles(id) on delete cascade,
  active boolean not null default true,
  check ((percent_off is null) <> (amount_off_minor is null))
);

create table orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete restrict,
  course_id uuid references courses(id) on delete restrict,
  bundle_id uuid references bundles(id) on delete restrict,
  coupon_id uuid references coupons(id),
  subtotal_minor int not null check (subtotal_minor >= 0),
  discount_minor int not null default 0 check (discount_minor >= 0),
  total_minor int not null check (total_minor >= 0),
  currency char(3) not null,
  method payment_method not null,
  status order_status not null default 'pending',
  manual_reference text, manual_receipt_path text,
  reviewed_by uuid references profiles(id), reviewed_at timestamptz,
  fulfilled_at timestamptz,               -- set once by fulfill_order
  created_at timestamptz not null default now(),
  check ((course_id is not null) <> (bundle_id is not null))
);
create index on orders(user_id); create index on orders(status);

create table payment_transactions (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete restrict,
  provider text not null, provider_txn_id text not null,
  provider_order_ref text,
  amount_minor int not null, currency char(3) not null,
  success boolean not null, raw jsonb not null,
  created_at timestamptz not null default now(),
  unique (provider, provider_txn_id)       -- idempotency: duplicate webhooks can't double-insert
);

create table subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  plan text not null, status sub_status not null default 'active',
  current_period_end timestamptz not null, created_at timestamptz not null default now()
);

create table enrollments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  course_id uuid not null references courses(id) on delete cascade,
  source enroll_source not null,
  order_id uuid references orders(id), subscription_id uuid references subscriptions(id),
  expires_at timestamptz, revoked_at timestamptz,
  last_lesson_id uuid references lessons(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (user_id, course_id)              -- no duplicate enrollments
);

create table lesson_progress (
  user_id uuid references profiles(id) on delete cascade,
  lesson_id uuid references lessons(id) on delete cascade,
  completed_at timestamptz, last_seen_at timestamptz not null default now(),
  primary key (user_id, lesson_id)
);

create table quizzes (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references courses(id) on delete cascade,
  lesson_id uuid references lessons(id) on delete set null,
  title text not null, pass_score int not null default 70,
  max_attempts int, shuffle boolean not null default true
);
create table quiz_questions (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references quizzes(id) on delete cascade,
  kind text not null check (kind in ('mcq','true_false')),
  prompt text not null, explanation text, sort_order int not null default 0
);
create table quiz_options (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references quiz_questions(id) on delete cascade,
  label text not null, is_correct boolean not null default false
);
create table quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references quizzes(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  score_percent int, passed boolean, submitted_at timestamptz,
  started_at timestamptz not null default now()
);
create table quiz_answers (
  attempt_id uuid references quiz_attempts(id) on delete cascade,
  question_id uuid references quiz_questions(id) on delete cascade,
  option_id uuid references quiz_options(id) on delete set null,
  is_correct boolean,
  primary key (attempt_id, question_id)
);

create table certificates (
  id uuid primary key default gen_random_uuid(),
  certificate_no text unique not null,
  user_id uuid not null references profiles(id) on delete restrict,
  course_id uuid not null references courses(id) on delete restrict,
  issued_at timestamptz not null default now(),
  unique (user_id, course_id)
);

create table announcements (
  id uuid primary key default gen_random_uuid(),
  course_id uuid references courses(id) on delete cascade,  -- null = platform-wide
  title text not null, body text not null,
  created_by uuid references profiles(id), created_at timestamptz not null default now()
);
create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  kind text not null, title text not null, body text,
  read_at timestamptz, created_at timestamptz not null default now()
);
create table audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references profiles(id) on delete set null,
  action text not null, entity text not null, entity_id text,
  details jsonb, created_at timestamptz not null default now()
);
create table settings (key text primary key, value jsonb not null);   -- NO secrets here

-- ---------- helpers ----------
create function current_role_of() returns user_role
language sql stable security definer set search_path = public as
$$ select role from profiles where id = auth.uid() and not suspended $$;

create function is_admin() returns boolean
language sql stable security definer set search_path = public as
$$ select coalesce(current_role_of() = 'super_admin', false) $$;

create function manages_course(cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_admin() or exists (
    select 1 from courses c where c.id = cid and c.instructor_id = auth.uid()
      and current_role_of() = 'instructor')
  or exists (select 1 from course_instructors ci where ci.course_id = cid
      and ci.instructor_id = auth.uid() and current_role_of() = 'instructor') $$;

create function has_access(cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from enrollments e where e.course_id = cid and e.user_id = auth.uid()
    and e.revoked_at is null and (e.expires_at is null or e.expires_at > now())) $$;

-- new sign-ups are ALWAYS students
create function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, full_name, phone)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name',''), new.raw_user_meta_data->>'phone');
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();

-- block self-service role/suspension changes
create function protect_profile_fields() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (new.role is distinct from old.role or new.suspended is distinct from old.suspended)
     and not (is_admin() or auth.uid() is null) then   -- auth.uid() null = service role / SQL editor
    raise exception 'not allowed';
  end if;
  return new;
end $$;
create trigger protect_profile before update on profiles
  for each row execute function protect_profile_fields();

-- Single fulfillment path (online webhook + manual approval). Idempotent.
create function fulfill_order(p_order uuid, p_source enroll_source)
returns boolean language plpgsql security definer set search_path = public as $$
declare o orders; cid uuid; c courses;
begin
  select * into o from orders where id = p_order for update;
  if not found then raise exception 'order not found'; end if;
  if o.fulfilled_at is not null then return false; end if;       -- already done
  if o.status <> 'paid' then raise exception 'order not paid'; end if;
  for cid in
    select course_id from orders where id = p_order and course_id is not null
    union select bc.course_id from bundle_courses bc where bc.bundle_id = o.bundle_id
  loop
    select * into c from courses where id = cid;
    insert into enrollments (user_id, course_id, source, order_id, expires_at)
    values (o.user_id, cid, p_source, o.id,
            case when c.access_days is null then null else now() + (c.access_days || ' days')::interval end)
    on conflict (user_id, course_id) do update
      set revoked_at = null, order_id = excluded.order_id, expires_at = excluded.expires_at;
  end loop;
  update orders set fulfilled_at = now() where id = p_order;
  insert into audit_logs(actor_id, action, entity, entity_id) values (auth.uid(), 'order_fulfilled', 'order', p_order::text);
  return true;
end $$;
revoke all on function fulfill_order(uuid, enroll_source) from public, anon, authenticated;
-- callable only with the server-side service role.

-- ---------- Row Level Security ----------
alter table profiles enable row level security;
alter table categories enable row level security;
alter table courses enable row level security;
alter table course_instructors enable row level security;
alter table sections enable row level security;
alter table lessons enable row level security;
alter table resources enable row level security;
alter table bundles enable row level security;
alter table bundle_courses enable row level security;
alter table coupons enable row level security;
alter table orders enable row level security;
alter table payment_transactions enable row level security;
alter table subscriptions enable row level security;
alter table enrollments enable row level security;
alter table lesson_progress enable row level security;
alter table quizzes enable row level security;
alter table quiz_questions enable row level security;
alter table quiz_options enable row level security;
alter table quiz_attempts enable row level security;
alter table quiz_answers enable row level security;
alter table certificates enable row level security;
alter table announcements enable row level security;
alter table notifications enable row level security;
alter table audit_logs enable row level security;
alter table settings enable row level security;

-- profiles
create policy p_self_read on profiles for select using (id = auth.uid() or is_admin());
create policy p_self_update on profiles for update using (id = auth.uid() or is_admin());
-- public catalog
create policy cat_read on categories for select using (true);
create policy cat_admin on categories for all using (is_admin()) with check (is_admin());
create policy c_read on courses for select using (status = 'published' or manages_course(id));
create policy c_admin_ins on courses for insert with check (is_admin());
create policy c_manage_upd on courses for update using (manages_course(id)) with check (manages_course(id));
create policy c_admin_del on courses for delete using (is_admin());
create policy ci_admin on course_instructors for all using (is_admin()) with check (is_admin());
create policy ci_self on course_instructors for select using (instructor_id = auth.uid());
-- sections: titles visible for published courses; lessons restricted
create policy s_read on sections for select using (
  exists (select 1 from courses c where c.id = course_id and c.status='published') or manages_course(course_id));
create policy s_manage on sections for all using (manages_course(course_id)) with check (manages_course(course_id));
create policy l_read on lessons for select using (
  manages_course(course_id) or (published and (is_free_preview or has_access(course_id))));
create policy l_manage on lessons for all using (manages_course(course_id)) with check (manages_course(course_id));
create policy r_read on resources for select using (manages_course(course_id) or has_access(course_id));
create policy r_manage on resources for all using (manages_course(course_id)) with check (manages_course(course_id));
create policy b_read on bundles for select using (status='published' or is_admin());
create policy b_admin on bundles for all using (is_admin()) with check (is_admin());
create policy bc_read on bundle_courses for select using (true);
create policy bc_admin on bundle_courses for all using (is_admin()) with check (is_admin());
create policy cp_admin on coupons for all using (is_admin()) with check (is_admin());   -- validated server-side
-- orders: students read own; creation/updates only via server (service role)
create policy o_read on orders for select using (user_id = auth.uid() or is_admin());
create policy pt_admin on payment_transactions for select using (is_admin());
create policy sub_read on subscriptions for select using (user_id = auth.uid() or is_admin());
create policy e_read on enrollments for select using (
  user_id = auth.uid() or is_admin() or manages_course(course_id));
create policy e_admin on enrollments for all using (is_admin()) with check (is_admin());
create policy lp_own on lesson_progress for select using (user_id = auth.uid() or manages_course((select course_id from lessons where id = lesson_id)));
-- progress written by server API after access check (no direct client insert)
create policy qz_read on quizzes for select using (has_access(course_id) or manages_course(course_id));
create policy qz_manage on quizzes for all using (manages_course(course_id)) with check (manages_course(course_id));
-- questions/options: managers only. Students get questions via a server endpoint WITHOUT is_correct.
create policy qq_manage on quiz_questions for all using (
  manages_course((select course_id from quizzes where id = quiz_id))) with check (
  manages_course((select course_id from quizzes where id = quiz_id)));
create policy qo_manage on quiz_options for all using (
  manages_course((select q.course_id from quizzes q join quiz_questions qq on qq.quiz_id=q.id where qq.id = question_id))) with check (
  manages_course((select q.course_id from quizzes q join quiz_questions qq on qq.quiz_id=q.id where qq.id = question_id)));
create policy qa_read on quiz_attempts for select using (user_id = auth.uid() or manages_course((select course_id from quizzes where id = quiz_id)));
create policy qans_read on quiz_answers for select using (
  exists (select 1 from quiz_attempts a where a.id = attempt_id and a.user_id = auth.uid()));
create policy cert_read on certificates for select using (user_id = auth.uid() or is_admin());
-- public verification goes through a server route using the service role, returning minimal fields only
create policy an_read on announcements for select using (
  course_id is null or has_access(course_id) or manages_course(course_id));
create policy an_manage on announcements for all using (
  case when course_id is null then is_admin() else manages_course(course_id) end)
  with check (case when course_id is null then is_admin() else manages_course(course_id) end);
create policy n_own on notifications for select using (user_id = auth.uid());
create policy n_own_upd on notifications for update using (user_id = auth.uid());
create policy al_admin on audit_logs for select using (is_admin());
create policy st_read on settings for select using (key like 'public.%' or is_admin());
create policy st_admin on settings for all using (is_admin()) with check (is_admin());
