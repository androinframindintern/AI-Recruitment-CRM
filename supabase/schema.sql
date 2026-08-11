-- ============================================================
-- AI Recruitment CRM — Full PostgreSQL Schema
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor)
-- Safe to re-run: all statements use IF NOT EXISTS / ON CONFLICT
-- ============================================================

-- Extensions
create extension if not exists pgcrypto;
create extension if not exists pg_trgm;  -- For full-text search on names/emails
create extension if not exists vector;   -- For Gemini embedding similarity search

-- ============================================================
-- HELPER: auto-update updated_at columns
-- ============================================================
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ============================================================
-- TABLE: profiles
-- Mirrors Supabase Auth users with extra fields (role, name)
-- ============================================================
create table if not exists profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text unique,
  full_name   text not null default '',
  avatar_url  text not null default '',
  role        text not null default 'candidate'
                check (role in ('admin', 'recruiter', 'candidate')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Trigger: keep updated_at current
create or replace trigger profiles_updated_at
  before update on profiles
  for each row execute function set_updated_at();

-- Auto-create profile on new Supabase Auth user
create or replace function handle_new_user()
returns trigger language plpgsql security definer as $$
declare
  requested_role text;
begin
  requested_role := coalesce(new.raw_user_meta_data->>'role', 'candidate');

  insert into profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    case when requested_role = 'recruiter' then 'recruiter' else 'candidate' end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- RLS: users can read/update their own profile; admins can read all
alter table profiles enable row level security;

create or replace function current_profile_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from profiles where id = auth.uid();
$$;

create or replace function current_user_is_company()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(current_profile_role() in ('admin', 'recruiter'), false);
$$;

create or replace function current_user_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(current_profile_role() = 'admin', false);
$$;

create or replace function ensure_my_profile()
returns profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_profile profiles;
  requested_role text;
begin
  select * into existing_profile
  from profiles
  where id = auth.uid();

  if found then
    return existing_profile;
  end if;

  requested_role := coalesce(auth.jwt()->'user_metadata'->>'role', 'candidate');

  insert into profiles (id, email, full_name, role)
  values (
    auth.uid(),
    coalesce(auth.jwt()->>'email', ''),
    coalesce(auth.jwt()->'user_metadata'->>'full_name', split_part(coalesce(auth.jwt()->>'email', ''), '@', 1), 'Job Seeker'),
    case when requested_role = 'recruiter' then 'recruiter' else 'candidate' end
  )
  returning * into existing_profile;

  return existing_profile;
end;
$$;

create policy "profiles_select_own" on profiles
  for select using (auth.uid() = id);

create policy "profiles_select_admin" on profiles
  for select using (
    current_user_is_admin()
  );

create policy "profiles_update_own" on profiles
  for update using (auth.uid() = id)
  with check (auth.uid() = id and role = current_profile_role());

-- ============================================================
-- TABLE: pipeline_stages (lookup / seed data)
-- ============================================================
create table if not exists pipeline_stages (
  id       text primary key,
  name     text not null,
  position int  not null unique,
  color    text not null default '#64748b'
);

insert into pipeline_stages (id, name, position, color) values
  ('new',                  'New',                1, '#6366f1'),
  ('parsed',               'Parsed',             2, '#0ea5e9'),
  ('shortlisted',          'Shortlisted',        3, '#f59e0b'),
  ('interview_scheduled',  'Interview Scheduled',4, '#8b5cf6'),
  ('selected',             'Selected',           5, '#10b981'),
  ('rejected',             'Rejected',           6, '#ef4444')
on conflict (id) do update
  set name = excluded.name,
      position = excluded.position,
      color = excluded.color;

-- ============================================================
-- TABLE: candidates
-- ============================================================
create table if not exists candidates (
  id               uuid primary key default gen_random_uuid(),
  owner_id         uuid not null references profiles(id) on delete cascade,
  full_name        text not null,
  email            text not null default '',
  phone            text not null default '',
  summary          text not null default '',
  current_company  text not null default '',
  current_title    text not null default '',
  years_experience numeric(5,2) not null default 0,
  location         text not null default '',
  stage            text not null references pipeline_stages(id) default 'new',
  skills           jsonb not null default '[]'::jsonb,
  education        jsonb not null default '[]'::jsonb,
  experience       jsonb not null default '[]'::jsonb,
  tags             jsonb not null default '[]'::jsonb,
  linkedin_url     text not null default '',
  portfolio_url    text not null default '',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- Indexes for performance
create index if not exists candidates_owner_id_idx    on candidates(owner_id);
create index if not exists candidates_stage_idx       on candidates(stage);
create index if not exists candidates_created_at_idx  on candidates(created_at desc);
create index if not exists candidates_skills_gin      on candidates using gin(skills);
create index if not exists candidates_tags_gin        on candidates using gin(tags);
create index if not exists candidates_full_name_trgm  on candidates using gin(full_name gin_trgm_ops);
create index if not exists candidates_email_trgm      on candidates using gin(email gin_trgm_ops);

-- Trigger: auto-update updated_at
create or replace trigger candidates_updated_at
  before update on candidates
  for each row execute function set_updated_at();

-- RLS
alter table candidates enable row level security;

create policy "candidates_select_owner" on candidates
  for select using (current_user_is_company() and owner_id = auth.uid());

create policy "candidates_select_admin" on candidates
  for select using (
    current_user_is_admin()
  );

create policy "candidates_insert_auth" on candidates
  for insert with check (current_user_is_company() and owner_id = auth.uid());

create policy "candidates_update_owner" on candidates
  for update using (current_user_is_company() and owner_id = auth.uid());

create policy "candidates_delete_owner" on candidates
  for delete using (current_user_is_company() and owner_id = auth.uid());

-- ============================================================
-- TABLE: candidate_resumes
-- ============================================================
create table if not exists candidate_resumes (
  id             uuid primary key default gen_random_uuid(),
  candidate_id   uuid not null references candidates(id) on delete cascade,
  file_name      text not null,
  mime_type      text not null default '',
  extracted_text text not null default '',
  storage_path   text,
  parse_status   text not null default 'parsed'
                   check (parse_status in ('pending', 'parsed', 'failed')),
  created_at     timestamptz not null default now()
);

create index if not exists candidate_resumes_candidate_id_idx on candidate_resumes(candidate_id);

alter table candidate_resumes enable row level security;

create policy "candidate_resumes_select" on candidate_resumes
  for select using (
    current_user_is_company()
    and (
      exists (select 1 from candidates c where c.id = candidate_id and c.owner_id = auth.uid())
      or current_user_is_admin()
    )
  );

create policy "candidate_resumes_insert" on candidate_resumes
  for insert with check (
    current_user_is_company()
    and exists (select 1 from candidates c where c.id = candidate_id and c.owner_id = auth.uid())
  );

-- ============================================================
-- TABLE: jobs
-- ============================================================
create table if not exists jobs (
  id                   uuid primary key default gen_random_uuid(),
  owner_id             uuid not null references profiles(id) on delete cascade,
  title                text not null,
  department           text not null default '',
  category             text not null default '',
  location             text not null default '',
  job_type             text not null default 'full-time'
                         check (job_type in ('full-time', 'part-time', 'contract', 'internship', 'temporary')),
  work_mode            text not null default 'on-site'
                         check (work_mode in ('remote', 'hybrid', 'on-site')),
  description          text not null,
  requirements         jsonb not null default '[]'::jsonb,
  salary_min           int,
  salary_max           int,
  salary_currency      text not null default 'USD',
  show_salary_publicly boolean not null default false,
  application_deadline timestamptz,
  status               text not null default 'draft'
                         check (status in ('draft', 'published', 'closed')),
  slug                 text unique,
  published_at         timestamptz,
  closed_at            timestamptz,
  is_active            boolean not null default false,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint jobs_salary_range_check check (salary_min is null or salary_max is null or salary_min <= salary_max)
);

alter table jobs
  add column if not exists category text not null default '',
  add column if not exists work_mode text not null default 'on-site',
  add column if not exists salary_currency text not null default 'USD',
  add column if not exists show_salary_publicly boolean not null default false,
  add column if not exists application_deadline timestamptz,
  add column if not exists status text not null default 'draft',
  add column if not exists slug text,
  add column if not exists published_at timestamptz,
  add column if not exists closed_at timestamptz;

alter table jobs drop constraint if exists jobs_job_type_check;
alter table jobs add constraint jobs_job_type_check
  check (job_type in ('full-time', 'part-time', 'contract', 'internship', 'temporary'));

alter table jobs drop constraint if exists jobs_work_mode_check;
alter table jobs add constraint jobs_work_mode_check
  check (work_mode in ('remote', 'hybrid', 'on-site'));

alter table jobs drop constraint if exists jobs_status_check;
alter table jobs add constraint jobs_status_check
  check (status in ('draft', 'published', 'closed'));

alter table jobs drop constraint if exists jobs_salary_range_check;
alter table jobs add constraint jobs_salary_range_check
  check (salary_min is null or salary_max is null or salary_min <= salary_max);

alter table jobs drop constraint if exists jobs_slug_key;

update jobs
set status = case when is_active then 'published' else 'closed' end,
    published_at = case when is_active and published_at is null then coalesce(created_at, now()) else published_at end,
    closed_at = case when not is_active and closed_at is null then coalesce(updated_at, now()) else closed_at end
where status = 'draft' and is_active is not null;

update jobs
set category = coalesce(nullif(category, ''), department, ''),
    salary_currency = upper(coalesce(nullif(salary_currency, ''), 'USD'));

update jobs
set slug = lower(regexp_replace(regexp_replace(title, '[^a-zA-Z0-9]+', '-', 'g'), '(^-+|-+$)', '', 'g')) || '-' || left(id::text, 8)
where slug is null or slug = '';

create unique index if not exists jobs_slug_unique_idx on jobs(slug) where slug is not null;
create index if not exists jobs_owner_id_idx   on jobs(owner_id);
create index if not exists jobs_is_active_idx  on jobs(is_active);
create index if not exists jobs_status_idx on jobs(status);
create index if not exists jobs_owner_status_idx on jobs(owner_id, status);
create index if not exists jobs_category_idx on jobs(category);
create index if not exists jobs_job_type_idx on jobs(job_type);
create index if not exists jobs_work_mode_idx on jobs(work_mode);
create index if not exists jobs_application_deadline_idx on jobs(application_deadline);
create index if not exists jobs_published_at_idx on jobs(published_at desc);
create index if not exists jobs_created_at_idx on jobs(created_at desc);

create or replace trigger jobs_updated_at
  before update on jobs
  for each row execute function set_updated_at();

alter table jobs enable row level security;

create policy "jobs_select_auth" on jobs
  for select using (current_user_is_company());

create policy "jobs_insert_auth" on jobs
  for insert with check (current_user_is_company() and owner_id = auth.uid());

create policy "jobs_update_owner" on jobs
  for update using (current_user_is_company() and owner_id = auth.uid());

create policy "jobs_delete_owner" on jobs
  for delete using (current_user_is_company() and owner_id = auth.uid());

-- ============================================================
-- TABLE: job_applications (public applications linked to ATS candidates)
-- ============================================================
create table if not exists job_applications (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null references profiles(id) on delete cascade,
  job_id          uuid not null references jobs(id) on delete cascade,
  candidate_id    uuid not null references candidates(id) on delete cascade,
  source          text not null default 'public_careers',
  status          text not null default 'submitted'
                    check (status in ('submitted', 'reviewing', 'withdrawn', 'rejected', 'hired')),
  cover_letter    text not null default '',
  applicant_email text not null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (job_id, applicant_email)
);

alter table job_applications
  add column if not exists owner_id uuid references profiles(id) on delete cascade,
  add column if not exists source text not null default 'public_careers',
  add column if not exists status text not null default 'submitted',
  add column if not exists cover_letter text not null default '',
  add column if not exists applicant_email text,
  add column if not exists updated_at timestamptz not null default now();

update job_applications
set owner_id = jobs.owner_id
from jobs
where job_applications.job_id = jobs.id
  and job_applications.owner_id is null;

alter table job_applications alter column owner_id set not null;
alter table job_applications alter column applicant_email set not null;
alter table job_applications drop constraint if exists job_applications_status_check;
alter table job_applications add constraint job_applications_status_check
  check (status in ('submitted', 'reviewing', 'withdrawn', 'rejected', 'hired'));

create unique index if not exists job_applications_job_email_idx on job_applications(job_id, applicant_email);
create index if not exists job_applications_owner_id_idx on job_applications(owner_id);
create index if not exists job_applications_job_id_idx on job_applications(job_id);
create index if not exists job_applications_candidate_id_idx on job_applications(candidate_id);
create index if not exists job_applications_created_at_idx on job_applications(created_at desc);

create or replace trigger job_applications_updated_at
  before update on job_applications
  for each row execute function set_updated_at();

alter table job_applications enable row level security;

drop policy if exists "job_applications_select_auth" on job_applications;
create policy "job_applications_select_auth" on job_applications
  for select using (current_user_is_company());

drop policy if exists "job_applications_insert_owner" on job_applications;
create policy "job_applications_insert_owner" on job_applications
  for insert with check (current_user_is_company() and owner_id = auth.uid());

drop policy if exists "job_applications_update_owner" on job_applications;
create policy "job_applications_update_owner" on job_applications
  for update using (current_user_is_company() and owner_id = auth.uid());

-- ============================================================
-- TABLE: candidate_job_scores (AI ranking results)
-- ============================================================
create table if not exists candidate_job_scores (
  id                 uuid primary key default gen_random_uuid(),
  candidate_id       uuid not null references candidates(id) on delete cascade,
  job_id             uuid not null references jobs(id) on delete cascade,
  score              int  not null check (score >= 0 and score <= 100),
  skill_match_percent int not null default 0
                         check (skill_match_percent >= 0 and skill_match_percent <= 100),
  matched_skills     jsonb not null default '[]'::jsonb,
  missing_skills     jsonb not null default '[]'::jsonb,
  explanation        text not null default '',
  embedding_similarity double precision,
  embedding_model    text,
  scoring_method     text not null default 'gemini_llm',
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (candidate_id, job_id)
);

alter table candidate_job_scores
  add column if not exists embedding_similarity double precision,
  add column if not exists embedding_model text,
  add column if not exists scoring_method text not null default 'gemini_llm',
  add column if not exists updated_at timestamptz not null default now();

create index if not exists scores_candidate_id_idx on candidate_job_scores(candidate_id);
create index if not exists scores_job_id_idx       on candidate_job_scores(job_id);
create index if not exists scores_score_idx        on candidate_job_scores(score desc);

create or replace trigger candidate_job_scores_updated_at
  before update on candidate_job_scores
  for each row execute function set_updated_at();

alter table candidate_job_scores enable row level security;

create policy "scores_select_auth" on candidate_job_scores
  for select using (current_user_is_company());

create policy "scores_insert_auth" on candidate_job_scores
  for insert with check (current_user_is_company());

-- ============================================================
-- TABLE: candidate_stage_history
-- ============================================================
create table if not exists candidate_stage_history (
  id           uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references candidates(id) on delete cascade,
  from_stage   text,
  to_stage     text not null references pipeline_stages(id),
  changed_by   uuid references profiles(id) on delete set null,
  note         text not null default '',
  created_at   timestamptz not null default now()
);

create index if not exists stage_history_candidate_id_idx on candidate_stage_history(candidate_id);

alter table candidate_stage_history enable row level security;

create policy "stage_history_select_auth" on candidate_stage_history
  for select using (current_user_is_company());

create policy "stage_history_insert_auth" on candidate_stage_history
  for insert with check (current_user_is_company());

-- ============================================================
-- TABLE: candidate_notes
-- ============================================================
create table if not exists candidate_notes (
  id           uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references candidates(id) on delete cascade,
  note         text not null,
  tags         jsonb not null default '[]'::jsonb,
  created_by   uuid references profiles(id) on delete set null,
  created_at   timestamptz not null default now()
);

create index if not exists notes_candidate_id_idx on candidate_notes(candidate_id);

alter table candidate_notes enable row level security;

create policy "notes_select_auth" on candidate_notes
  for select using (current_user_is_company());

create policy "notes_insert_auth" on candidate_notes
  for insert with check (current_user_is_company());

create policy "notes_delete_own" on candidate_notes
  for delete using (current_user_is_company() and created_by = auth.uid());

-- ============================================================
-- TABLE: interviews
-- ============================================================
create table if not exists interviews (
  id                  uuid primary key default gen_random_uuid(),
  candidate_id        uuid not null references candidates(id) on delete cascade,
  job_id              uuid references jobs(id) on delete set null,
  title               text not null,
  description         text not null default '',
  attendee_email      text not null default '',
  interviewer_email   text not null default '',
  start_at            timestamptz not null,
  end_at              timestamptz not null,
  timezone            text not null default 'UTC',
  external_event_id   text,
  external_event_link text,
  status              text not null default 'scheduled'
                        check (status in ('scheduled', 'completed', 'cancelled', 'rescheduled')),
  created_by          uuid references profiles(id) on delete set null,
  created_at          timestamptz not null default now()
);

alter table interviews
  add column if not exists owner_id uuid references profiles(id) on delete cascade,
  add column if not exists availability_id uuid,
  add column if not exists interview_type text not null default 'custom',
  add column if not exists location text not null default '',
  add column if not exists meeting_url text not null default '',
  add column if not exists calendar_provider text not null default 'none',
  add column if not exists calendar_id text,
  add column if not exists calendar_event_status text,
  add column if not exists sync_status text not null default 'not_connected',
  add column if not exists sync_error text not null default '',
  add column if not exists last_synced_at timestamptz,
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancel_reason text not null default '',
  add column if not exists updated_at timestamptz not null default now();

update interviews
set owner_id = coalesce(interviews.owner_id, candidates.owner_id)
from candidates
where interviews.candidate_id = candidates.id
  and interviews.owner_id is null;

alter table interviews alter column owner_id set not null;

alter table interviews drop constraint if exists interviews_interview_type_check;
alter table interviews add constraint interviews_interview_type_check
  check (interview_type in ('hr', 'technical', 'final', 'manager', 'custom'));

alter table interviews drop constraint if exists interviews_sync_status_check;
alter table interviews add constraint interviews_sync_status_check
  check (sync_status in ('not_connected', 'pending', 'synced', 'failed', 'deleted', 'demo'));

create index if not exists interviews_candidate_id_idx on interviews(candidate_id);
create index if not exists interviews_owner_id_idx on interviews(owner_id);
create index if not exists interviews_job_id_idx on interviews(job_id);
create index if not exists interviews_start_at_idx on interviews(start_at);
create index if not exists interviews_sync_status_idx on interviews(sync_status);

create or replace trigger interviews_updated_at
  before update on interviews
  for each row execute function set_updated_at();

alter table interviews enable row level security;

create policy "interviews_select_auth" on interviews
  for select using (current_user_is_company());

create policy "interviews_insert_auth" on interviews
  for insert with check (current_user_is_company() and owner_id = auth.uid());

create policy "interviews_update_auth" on interviews
  for update using (current_user_is_company() and owner_id = auth.uid());

create policy "interviews_delete_auth" on interviews
  for delete using (current_user_is_company() and owner_id = auth.uid());

-- ============================================================
-- TABLE: candidate_availability
-- ============================================================
create table if not exists candidate_availability (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references profiles(id) on delete cascade,
  candidate_id uuid not null references candidates(id) on delete cascade,
  start_at     timestamptz not null,
  end_at       timestamptz not null,
  timezone     text not null default 'UTC',
  status       text not null default 'available'
                 check (status in ('available', 'held', 'booked', 'cancelled', 'expired')),
  source       text not null default 'manual',
  notes        text not null default '',
  created_by   uuid references profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint candidate_availability_time_check check (end_at > start_at)
);

create index if not exists candidate_availability_owner_id_idx on candidate_availability(owner_id);
create index if not exists candidate_availability_candidate_id_idx on candidate_availability(candidate_id);
create index if not exists candidate_availability_start_at_idx on candidate_availability(start_at);
create index if not exists candidate_availability_status_idx on candidate_availability(status);

alter table candidate_availability drop constraint if exists candidate_availability_status_check;
alter table candidate_availability add constraint candidate_availability_status_check
  check (status in ('available', 'held', 'booked', 'cancelled', 'expired'));

alter table candidate_availability drop constraint if exists candidate_availability_time_check;
alter table candidate_availability add constraint candidate_availability_time_check
  check (end_at > start_at);

create or replace trigger candidate_availability_updated_at
  before update on candidate_availability
  for each row execute function set_updated_at();

alter table candidate_availability enable row level security;

create policy "candidate_availability_select_auth" on candidate_availability
  for select using (current_user_is_company());

create policy "candidate_availability_insert_auth" on candidate_availability
  for insert with check (current_user_is_company() and owner_id = auth.uid());

create policy "candidate_availability_update_auth" on candidate_availability
  for update using (current_user_is_company() and owner_id = auth.uid());

create policy "candidate_availability_delete_auth" on candidate_availability
  for delete using (current_user_is_company() and owner_id = auth.uid());

-- ============================================================
-- TABLE: google_calendar_connections
-- ============================================================
create table if not exists google_calendar_connections (
  id                       uuid primary key default gen_random_uuid(),
  owner_id                 uuid not null references profiles(id) on delete cascade,
  provider                 text not null default 'google',
  google_account_email     text not null default '',
  calendar_id              text not null default 'primary',
  calendar_summary         text not null default 'Primary calendar',
  refresh_token_ciphertext text not null default '',
  refresh_token_iv         text not null default '',
  refresh_token_tag        text not null default '',
  scopes                   jsonb not null default '[]'::jsonb,
  connected_at             timestamptz,
  revoked_at               timestamptz,
  last_sync_at             timestamptz,
  sync_status              text not null default 'connected',
  sync_error               text not null default '',
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  unique (owner_id, provider)
);

create index if not exists google_calendar_connections_owner_idx on google_calendar_connections(owner_id);
create index if not exists google_calendar_connections_provider_idx on google_calendar_connections(provider);

create or replace trigger google_calendar_connections_updated_at
  before update on google_calendar_connections
  for each row execute function set_updated_at();

alter table google_calendar_connections enable row level security;

create policy "google_calendar_connections_select_owner" on google_calendar_connections
  for select using (current_user_is_company() and owner_id = auth.uid());

create policy "google_calendar_connections_insert_owner" on google_calendar_connections
  for insert with check (current_user_is_company() and owner_id = auth.uid());

create policy "google_calendar_connections_update_owner" on google_calendar_connections
  for update using (current_user_is_company() and owner_id = auth.uid());

create policy "google_calendar_connections_delete_owner" on google_calendar_connections
  for delete using (current_user_is_company() and owner_id = auth.uid());

-- ============================================================
-- TABLE: email_logs
-- ============================================================
create table if not exists email_logs (
  id                  uuid primary key default gen_random_uuid(),
  candidate_id        uuid not null references candidates(id) on delete cascade,
  type                text not null
                        check (type in ('shortlisted', 'interview_scheduled', 'rejected', 'custom')),
  recipient_email     text not null,
  external_message_id text,
  subject             text not null default '',
  body_preview        text not null default '',
  status              text not null default 'sent'
                        check (status in ('sent', 'failed', 'demo')),
  created_by          uuid references profiles(id) on delete set null,
  created_at          timestamptz not null default now()
);

alter table email_logs
  add column if not exists provider text not null default 'nodemailer',
  add column if not exists sent_at timestamptz;

create index if not exists email_logs_candidate_id_idx on email_logs(candidate_id);
create index if not exists email_logs_created_at_idx on email_logs(created_at);
create index if not exists email_logs_status_idx on email_logs(status);
create index if not exists email_logs_type_idx on email_logs(type);

alter table email_logs enable row level security;

create policy "email_logs_select_auth" on email_logs
  for select using (current_user_is_company());

create policy "email_logs_insert_auth" on email_logs
  for insert with check (current_user_is_company());

-- ============================================================
-- TABLE: candidate_embeddings (Gemini vector search)
-- ============================================================
create table if not exists candidate_embeddings (
  id               uuid primary key default gen_random_uuid(),
  candidate_id     uuid not null references candidates(id) on delete cascade,
  provider         text not null default 'gemini',
  model            text not null default 'text-embedding-004',
  dimensions       int not null default 768,
  content_hash     text not null default '',
  embedding        jsonb not null default '[]'::jsonb,
  embedding_vector vector(768),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (candidate_id, provider, model)
);

alter table candidate_embeddings
  add column if not exists provider text not null default 'gemini',
  add column if not exists model text not null default 'text-embedding-004',
  add column if not exists dimensions int not null default 768,
  add column if not exists content_hash text not null default '',
  add column if not exists embedding_vector vector(768),
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists candidate_embeddings_candidate_provider_model_idx on candidate_embeddings(candidate_id, provider, model);
create index if not exists candidate_embeddings_candidate_id_idx on candidate_embeddings(candidate_id);
create index if not exists candidate_embeddings_vector_hnsw on candidate_embeddings using hnsw (embedding_vector vector_cosine_ops) where embedding_vector is not null;

create or replace trigger candidate_embeddings_updated_at
  before update on candidate_embeddings
  for each row execute function set_updated_at();

alter table candidate_embeddings enable row level security;

create policy "embeddings_select_auth" on candidate_embeddings
  for select using (current_user_is_company());

create policy "embeddings_insert_auth" on candidate_embeddings
  for insert with check (current_user_is_company());

-- ============================================================
-- TABLE: job_embeddings (Gemini vector search)
-- ============================================================
create table if not exists job_embeddings (
  id               uuid primary key default gen_random_uuid(),
  job_id           uuid not null references jobs(id) on delete cascade,
  provider         text not null default 'gemini',
  model            text not null default 'text-embedding-004',
  dimensions       int not null default 768,
  content_hash     text not null default '',
  embedding        jsonb not null default '[]'::jsonb,
  embedding_vector vector(768),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (job_id, provider, model)
);

alter table job_embeddings
  add column if not exists provider text not null default 'gemini',
  add column if not exists model text not null default 'text-embedding-004',
  add column if not exists dimensions int not null default 768,
  add column if not exists content_hash text not null default '',
  add column if not exists embedding_vector vector(768),
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists job_embeddings_job_provider_model_idx on job_embeddings(job_id, provider, model);
create index if not exists job_embeddings_job_id_idx on job_embeddings(job_id);
create index if not exists job_embeddings_vector_hnsw on job_embeddings using hnsw (embedding_vector vector_cosine_ops) where embedding_vector is not null;

create or replace trigger job_embeddings_updated_at
  before update on job_embeddings
  for each row execute function set_updated_at();

alter table job_embeddings enable row level security;

create policy "job_embeddings_select_auth" on job_embeddings
  for select using (current_user_is_company());

create policy "job_embeddings_insert_auth" on job_embeddings
  for insert with check (current_user_is_company());

create or replace function match_candidates_for_job(
  p_job_id uuid,
  p_owner_id uuid,
  p_limit int default 50,
  p_min_similarity double precision default 0
)
returns table (
  candidate_id uuid,
  similarity double precision
)
language sql
stable
as $$
  select
    c.id as candidate_id,
    greatest(0, least(1, 1 - (ce.embedding_vector <=> je.embedding_vector))) as similarity
  from job_embeddings je
  join candidate_embeddings ce
    on ce.provider = je.provider
   and ce.model = je.model
   and ce.dimensions = je.dimensions
   and ce.embedding_vector is not null
  join candidates c
    on c.id = ce.candidate_id
  where je.job_id = p_job_id
    and je.embedding_vector is not null
    and c.owner_id = p_owner_id
    and greatest(0, least(1, 1 - (ce.embedding_vector <=> je.embedding_vector))) >= p_min_similarity
  order by ce.embedding_vector <=> je.embedding_vector
  limit least(greatest(p_limit, 1), 100);
$$;


-- ============================================================
-- TABLE: email_templates (for customizable templates)
-- ============================================================
create table if not exists email_templates (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  subject     text not null,
  body        text not null,
  type        text not null check (
                type in ('shortlisted', 'interview_scheduled', 'rejected', 'custom')
              ),
  is_default  boolean not null default false,
  created_by  uuid references profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create or replace trigger email_templates_updated_at
  before update on email_templates
  for each row execute function set_updated_at();

alter table email_templates enable row level security;

create policy "email_templates_select_auth" on email_templates
  for select using (current_user_is_company());

create policy "email_templates_insert_auth" on email_templates
  for insert with check (current_user_is_company());

create policy "email_templates_update_auth" on email_templates
  for update using (current_user_is_company());

-- ============================================================
-- Seed: default email templates
-- ============================================================
insert into email_templates (name, subject, body, type, is_default) values
(
  'shortlisted_default',
  'You have been shortlisted for {{job_title}} at {{company_name}}',
  'Hi {{candidate_name}},

We are excited to let you know that you have been shortlisted for the {{job_title}} position at {{company_name}}.

Our team was impressed by your background and we would like to move forward in the process.

We will be in touch shortly with next steps.

Best regards,
{{recruiter_name}}',
  'shortlisted',
  true
),
(
  'interview_scheduled_default',
  'Interview Scheduled: {{job_title}} on {{interview_date}}',
  'Hi {{candidate_name}},

Your interview for the {{job_title}} position has been scheduled.

Date & Time: {{interview_date}} at {{interview_time}}
Duration: {{duration}} minutes
Format: {{interview_format}}

{{calendar_link}}

Please let us know if you need to reschedule.

Best regards,
{{recruiter_name}}',
  'interview_scheduled',
  true
),
(
  'rejected_default',
  'Update on your application for {{job_title}}',
  'Hi {{candidate_name}},

Thank you for taking the time to apply for the {{job_title}} position at {{company_name}}.

After careful consideration, we have decided to move forward with other candidates whose experience more closely matches our current needs.

We appreciate your interest and encourage you to apply for future openings.

Best regards,
{{recruiter_name}}',
  'rejected',
  true
)
on conflict (name) do nothing;

-- ============================================================
-- Storage: Supabase bucket policy for resumes (run separately)
-- Note: Create the 'resumes' bucket in the Supabase dashboard
-- then apply these policies via Storage → Policies
-- ============================================================
-- The bucket should be PRIVATE.
-- Recruiters can upload to their own folder: {user_id}/filename
-- Service role (server) has full access via service key.
