-- Fermín · initial schema
-- Mirrors lib/domain/types.ts. One academy per tenant; every row carries
-- academy_id and is protected by row level security.

create extension if not exists "pgcrypto";
create extension if not exists "btree_gist";

create type sport as enum ('tennis', 'padel', 'pickleball');
create type age_group as enum ('junior', 'adult');
create type student_status as enum ('trial', 'pending', 'active');
create type member_role as enum ('admin', 'lead_coach', 'coach');
create type cancel_reason as enum ('weather', 'other');
create type absence_reason as enum ('medical', 'other');
create type makeup_reason as enum ('weather', 'medical');
create type makeup_status as enum ('open', 'booked', 'used');

create table academies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  timezone text not null default 'Europe/Madrid',
  day_start_hour smallint not null default 15 check (day_start_hour between 0 and 23),
  day_end_hour smallint not null default 22 check (day_end_hour between 1 and 24),
  class_duration_min smallint not null default 60,
  open_weekdays smallint[] not null default '{1,2,3,4,5}',
  -- null = make-up credits never expire; otherwise days counted from the missed class
  makeup_expiry_days smallint check (makeup_expiry_days > 0),
  -- null = no limit on make-up credits a student can earn in a season
  makeup_cap_per_season smallint check (makeup_cap_per_season > 0),
  -- small groups may take students from the adjacent level
  mix_levels_enabled boolean not null default true,
  mix_levels_max_group smallint not null default 2 check (mix_levels_max_group between 1 and 6),
  created_at timestamptz not null default now(),
  check (day_end_hour > day_start_hour)
);

-- Staff who can sign in. Links auth.users to an academy with a role.
create table academy_members (
  academy_id uuid not null references academies on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  role member_role not null default 'coach',
  primary key (academy_id, user_id)
);

create table seasons (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references academies on delete cascade,
  label text not null,
  starts_on date not null,
  ends_on date not null,
  check (ends_on > starts_on)
);

create table locations (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references academies on delete cascade,
  name text not null,
  short_name text not null,
  city text,
  lat double precision not null,
  lon double precision not null
);

create table courts (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references academies on delete cascade,
  location_id uuid not null references locations on delete cascade,
  name text not null,
  short_name text not null,
  sport sport not null,
  covered boolean not null default false
);

create table coaches (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references academies on delete cascade,
  user_id uuid references auth.users,
  first_name text not null,
  last_name text not null,
  sports sport[] not null,
  is_lead boolean not null default false,
  home_location_id uuid references locations
);

create table families (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references academies on delete cascade,
  name text not null,
  holder_name text not null,
  holder_student_id uuid,
  phone text,
  email text
);

create table students (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references academies on delete cascade,
  family_id uuid not null references families on delete restrict,
  first_name text not null,
  last_name text not null,
  birth_date date not null,
  age_group age_group not null,
  sport sport not null,
  level smallint check (level between 1 and 4),
  status student_status not null default 'trial',
  available_weekdays smallint[] not null default '{}',
  available_from_hour smallint not null default 15,
  available_to_hour smallint not null default 22,
  frequency smallint not null default 2 check (frequency between 1 and 3),
  home_location_id uuid references locations,
  trial_date date,
  phone text,
  email text,
  notes text,
  created_at timestamptz not null default now(),
  -- a level is required as soon as the trial has been assessed
  check (status = 'trial' or level is not null)
);
alter table families add constraint families_holder_fk foreign key (holder_student_id) references students on delete set null;

-- A weekly recurring class for one season.
create table classes (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references academies on delete cascade,
  season_id uuid not null references seasons on delete cascade,
  location_id uuid not null references locations,
  court_id uuid not null references courts,
  coach_id uuid not null references coaches,
  sport sport not null,
  age_group age_group not null,
  level smallint not null check (level between 1 and 4),
  weekday smallint not null check (weekday between 1 and 7),
  start_hour smallint not null,
  capacity smallint not null check (capacity > 0),
  -- one class per court and per coach in any weekly slot
  unique (season_id, court_id, weekday, start_hour),
  unique (season_id, coach_id, weekday, start_hour)
);

create table enrollments (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references academies on delete cascade,
  student_id uuid not null references students on delete cascade,
  class_id uuid not null references classes on delete cascade,
  starts_on date not null,
  ends_on date,
  check (ends_on is null or ends_on >= starts_on),
  -- a student cannot hold two overlapping seats in the same class
  exclude using gist (student_id with =, class_id with =, daterange(starts_on, coalesce(ends_on, 'infinity'::date), '[]') with &&)
);
create index enrollments_class_idx on enrollments (class_id);
create index enrollments_student_idx on enrollments (student_id);

-- A change to one dated session of a weekly class: rain, substitute, court swap.
create table session_overrides (
  class_id uuid not null references classes on delete cascade,
  session_date date not null,
  academy_id uuid not null references academies on delete cascade,
  cancelled cancel_reason,
  coach_id uuid references coaches,
  court_id uuid references courts,
  primary key (class_id, session_date)
);

create table absences (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references academies on delete cascade,
  student_id uuid not null references students on delete cascade,
  class_id uuid not null references classes on delete cascade,
  session_date date not null,
  reason absence_reason not null,
  certificate_received boolean not null default false,
  certificate_path text,
  unique (student_id, class_id, session_date)
);

-- The only two ways to earn a make-up: rain, or a medical absence with certificate.
-- Expiry is not stored: it is origin_date + academies.makeup_expiry_days, so
-- changing the setting applies to credits that are already open.
create table makeup_credits (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references academies on delete cascade,
  student_id uuid not null references students on delete cascade,
  reason makeup_reason not null,
  origin_class_id uuid not null references classes,
  origin_date date not null,
  status makeup_status not null default 'open',
  booked_class_id uuid references classes,
  booked_date date,
  created_at timestamptz not null default now(),
  unique (student_id, origin_class_id, origin_date)
);

-- Weekly training programme: one theme per sport and week, one goal per level.
create table program_weeks (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references academies on delete cascade,
  season_id uuid not null references seasons on delete cascade,
  sport sport not null,
  week_number smallint not null,
  block text not null,
  title text not null,
  goals text[] not null check (array_length(goals, 1) = 4),
  unique (season_id, sport, week_number)
);

-- Every confirmed command, typed or spoken, with the draft that was applied.
create table action_log (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references academies on delete cascade,
  actor_id uuid references auth.users,
  source text not null check (source in ('ui', 'text', 'voice')),
  interpreter text check (interpreter in ('rules', 'jev')),
  utterance text,
  slots jsonb,
  draft jsonb not null,
  undone_at timestamptz,
  created_at timestamptz not null default now()
);

-- Seats taken per class today. The app reads capacity through this view.
create view class_occupancy with (security_invoker = true) as
select c.id as class_id, c.capacity,
       count(e.id) filter (where e.starts_on <= current_date and (e.ends_on is null or e.ends_on >= current_date)) as taken
from classes c left join enrollments e on e.class_id = c.id
group by c.id;

-- ── Row level security ─────────────────────────────────────────────────
create or replace function is_member(target uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from academy_members m where m.academy_id = target and m.user_id = auth.uid());
$$;

do $$
declare t text;
begin
  foreach t in array array['seasons','locations','courts','coaches','families','students','classes','enrollments',
                           'session_overrides','absences','makeup_credits','program_weeks','action_log']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy %I on %I for all using (is_member(academy_id)) with check (is_member(academy_id))', t || '_tenant', t);
  end loop;
end $$;

-- Only the admin moves students: staff can read enrollments, only admins write them.
create or replace function is_admin(target uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from academy_members m where m.academy_id = target and m.user_id = auth.uid() and m.role = 'admin');
$$;
drop policy enrollments_tenant on enrollments;
create policy enrollments_read on enrollments for select using (is_member(academy_id));
create policy enrollments_admin_write on enrollments for all using (is_admin(academy_id)) with check (is_admin(academy_id));

alter table academies enable row level security;
create policy academies_tenant on academies for select using (is_member(id));
alter table academy_members enable row level security;
create policy members_self on academy_members for select using (user_id = auth.uid());
