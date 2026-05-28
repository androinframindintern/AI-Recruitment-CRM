create extension if not exists pgcrypto;

create table if not exists profiles (
  id uuid primary key,
  email text unique,
  full_name text not null default '',
  role text not null default 'recruiter' check (role in ('admin', 'recruiter')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists pipeline_stages (
  id text primary key,
  name text not null,
  position int not null unique
);

insert into pipeline_stages (id, name, position) values
  ('new', 'New', 1),
  ('parsed', 'Parsed', 2),
  ('shortlisted', 'Shortlisted', 3),
  ('interview_scheduled', 'Interview Scheduled', 4),
  ('selected', 'Selected', 5),
  ('rejected', 'Rejected', 6)
on conflict (id) do update set name = excluded.name, position = excluded.position;

create table if not exists candidates (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  full_name text not null,
  email text not null default '',
  phone text not null default '',
  summary text not null default '',
  current_company text not null default '',
  current_title text not null default '',
  years_experience numeric(5,2) not null default 0,
  location text not null default '',
  stage text not null references pipeline_stages(id) default 'new',
  skills jsonb not null default '[]'::jsonb,
  education jsonb not null default '[]'::jsonb,
  experience jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists candidate_resumes (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references candidates(id) on delete cascade,
  file_name text not null,
  mime_type text not null default '',
  extracted_text text not null default '',
  storage_path text,
  parse_status text not null default 'parsed',
  created_at timestamptz not null default now()
);

create table if not exists jobs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  title text not null,
  department text not null default '',
  location text not null default '',
  description text not null,
  requirements jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists candidate_job_scores (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references candidates(id) on delete cascade,
  job_id uuid not null references jobs(id) on delete cascade,
  score int not null check (score >= 0 and score <= 100),
  skill_match_percent int not null default 0 check (skill_match_percent >= 0 and skill_match_percent <= 100),
  matched_skills jsonb not null default '[]'::jsonb,
  missing_skills jsonb not null default '[]'::jsonb,
  explanation text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists candidate_stage_history (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references candidates(id) on delete cascade,
  from_stage text,
  to_stage text not null references pipeline_stages(id),
  changed_by uuid,
  created_at timestamptz not null default now()
);

create table if not exists candidate_notes (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references candidates(id) on delete cascade,
  note text not null,
  tags jsonb not null default '[]'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now()
);

create table if not exists interviews (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references candidates(id) on delete cascade,
  title text not null,
  description text not null default '',
  attendee_email text not null default '',
  start_at timestamptz not null,
  end_at timestamptz not null,
  external_event_id text,
  external_event_link text,
  status text not null default 'scheduled',
  created_by uuid,
  created_at timestamptz not null default now()
);

create table if not exists email_logs (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references candidates(id) on delete cascade,
  type text not null,
  recipient_email text not null,
  external_message_id text,
  subject text not null default '',
  status text not null default 'sent',
  created_by uuid,
  created_at timestamptz not null default now()
);

create table if not exists candidate_embeddings (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references candidates(id) on delete cascade,
  provider text not null default 'faiss',
  embedding jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
