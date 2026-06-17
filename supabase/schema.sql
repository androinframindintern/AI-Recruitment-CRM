-- ============================================================
-- AI Recruitment CRM — Full PostgreSQL Schema
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor)
-- Safe to re-run: all statements use IF NOT EXISTS / ON CONFLICT
-- ============================================================

-- Extensions
create extension if not exists pgcrypto;
create extension if not exists pg_trgm;  -- For full-text search on names/emails

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
  role        text not null default 'recruiter'
                check (role in ('admin', 'recruiter')),
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
begin
  insert into profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'role', 'recruiter')
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

create policy "profiles_select_own" on profiles
  for select using (auth.uid() = id);

create policy "profiles_select_admin" on profiles
  for select using (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
  );

create policy "profiles_update_own" on profiles
  for update using (auth.uid() = id);

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
  for select using (owner_id = auth.uid());

create policy "candidates_select_admin" on candidates
  for select using (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
  );

create policy "candidates_insert_auth" on candidates
  for insert with check (owner_id = auth.uid());

create policy "candidates_update_owner" on candidates
  for update using (owner_id = auth.uid());

create policy "candidates_delete_owner" on candidates
  for delete using (owner_id = auth.uid());

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
    exists (select 1 from candidates c where c.id = candidate_id and c.owner_id = auth.uid())
    or exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
  );

create policy "candidate_resumes_insert" on candidate_resumes
  for insert with check (
    exists (select 1 from candidates c where c.id = candidate_id and c.owner_id = auth.uid())
  );

-- ============================================================
-- TABLE: jobs
-- ============================================================
create table if not exists jobs (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references profiles(id) on delete cascade,
  title        text not null,
  department   text not null default '',
  location     text not null default '',
  job_type     text not null default 'full-time'
                 check (job_type in ('full-time', 'part-time', 'contract', 'internship')),
  description  text not null,
  requirements jsonb not null default '[]'::jsonb,
  salary_min   int,
  salary_max   int,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists jobs_owner_id_idx   on jobs(owner_id);
create index if not exists jobs_is_active_idx  on jobs(is_active);
create index if not exists jobs_created_at_idx on jobs(created_at desc);

create or replace trigger jobs_updated_at
  before update on jobs
  for each row execute function set_updated_at();

alter table jobs enable row level security;

create policy "jobs_select_auth" on jobs
  for select using (auth.uid() is not null);

create policy "jobs_insert_auth" on jobs
  for insert with check (owner_id = auth.uid());

create policy "jobs_update_owner" on jobs
  for update using (owner_id = auth.uid());

create policy "jobs_delete_owner" on jobs
  for delete using (owner_id = auth.uid());

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
  created_at         timestamptz not null default now(),
  unique (candidate_id, job_id)
);

create index if not exists scores_candidate_id_idx on candidate_job_scores(candidate_id);
create index if not exists scores_job_id_idx       on candidate_job_scores(job_id);
create index if not exists scores_score_idx        on candidate_job_scores(score desc);

alter table candidate_job_scores enable row level security;

create policy "scores_select_auth" on candidate_job_scores
  for select using (auth.uid() is not null);

create policy "scores_insert_auth" on candidate_job_scores
  for insert with check (auth.uid() is not null);

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
  for select using (auth.uid() is not null);

create policy "stage_history_insert_auth" on candidate_stage_history
  for insert with check (auth.uid() is not null);

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
  for select using (auth.uid() is not null);

create policy "notes_insert_auth" on candidate_notes
  for insert with check (auth.uid() is not null);

create policy "notes_delete_own" on candidate_notes
  for delete using (created_by = auth.uid());

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

create index if not exists interviews_candidate_id_idx on interviews(candidate_id);
create index if not exists interviews_start_at_idx     on interviews(start_at);

alter table interviews enable row level security;

create policy "interviews_select_auth" on interviews
  for select using (auth.uid() is not null);

create policy "interviews_insert_auth" on interviews
  for insert with check (auth.uid() is not null);

create policy "interviews_update_auth" on interviews
  for update using (auth.uid() is not null);

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

create index if not exists email_logs_candidate_id_idx on email_logs(candidate_id);

alter table email_logs enable row level security;

create policy "email_logs_select_auth" on email_logs
  for select using (auth.uid() is not null);

create policy "email_logs_insert_auth" on email_logs
  for insert with check (auth.uid() is not null);

-- ============================================================
-- TABLE: candidate_embeddings (optional vector search)
-- ============================================================
create table if not exists candidate_embeddings (
  id           uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references candidates(id) on delete cascade,
  provider     text not null default 'gemini',
  embedding    jsonb not null default '[]'::jsonb,
  created_at   timestamptz not null default now(),
  unique (candidate_id, provider)
);

alter table candidate_embeddings enable row level security;

create policy "embeddings_select_auth" on candidate_embeddings
  for select using (auth.uid() is not null);

create policy "embeddings_insert_auth" on candidate_embeddings
  for insert with check (auth.uid() is not null);

-- ============================================================
-- TABLE: email_templates (for customizable templates)
-- ============================================================
create table if not exists email_templates (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  subject     text not null,
  body        text not null,
  type        text not null references email_logs check (
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
  for select using (auth.uid() is not null);

create policy "email_templates_insert_auth" on email_templates
  for insert with check (auth.uid() is not null);

create policy "email_templates_update_auth" on email_templates
  for update using (auth.uid() is not null);

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
