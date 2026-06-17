# AI Recruitment CRM — System Architecture

## Overview

```
┌─────────────────────────────────────────────────────┐
│                  Browser (React / Next.js)           │
│  ┌──────────┐ ┌─────────────┐ ┌──────────────────┐  │
│  │ Auth UI  │ │ ATS Kanban  │ │ Analytics Dash   │  │
│  └──────────┘ └─────────────┘ └──────────────────┘  │
└────────────────────────┬────────────────────────────┘
                         │ REST (fetch / React Query)
          ┌──────────────▼──────────────┐
          │  Next.js API Routes or      │
          │  Express Server (port 4000) │
          └──────────────┬──────────────┘
          ┌──────────────┼──────────────────┐
          ▼              ▼                  ▼
   ┌─────────────┐ ┌──────────┐  ┌────────────────┐
   │  Supabase   │ │  Gemini  │  │ External APIs  │
   │  (Postgres  │ │  AI API  │  │ Resend + GCal  │
   │  + Auth +   │ │          │  │                │
   │  Storage)   │ └──────────┘  └────────────────┘
   └─────────────┘
```

## Directory Structure

```
ai-recruitment-crm/
├── src/
│   ├── app/                        # Next.js App Router pages
│   │   ├── _components/            # Shared UI components
│   │   ├── dashboard/              # Dashboard page
│   │   ├── candidates/             # ATS pipeline + profile pages
│   │   │   └── [id]/              # Individual candidate profile
│   │   ├── jobs/                   # Job management
│   │   ├── analytics/              # Charts & metrics
│   │   ├── settings/               # Integration config
│   │   ├── login/                  # Authentication
│   │   ├── reset-password/         # Password reset
│   │   ├── layout.js               # Root layout
│   │   └── globals.css             # Design system
│   └── lib/
│       ├── api.js                  # Fetch wrapper with auth
│       ├── supabaseClient.js       # Browser Supabase client
│       └── useAuthUser.js          # Auth state hook
│
├── server/                         # Express backend (optional standalone)
│   ├── routes/
│   │   ├── auth/                   # me.js, reset.js
│   │   ├── candidates.js           # Resume upload + CRUD + notes
│   │   ├── jobs.js                 # Job CRUD
│   │   ├── matching.js             # AI scoring
│   │   ├── interviews.js           # Calendar scheduling
│   │   ├── emails.js               # Email automation
│   │   └── analytics.js            # Stats & funnel
│   ├── middleware/
│   │   └── auth.js                 # JWT verification + requireRole()
│   ├── lib/
│   │   ├── supabase.js             # Server Supabase admin client
│   │   ├── gemini.js               # AI resume parsing + scoring
│   │   ├── resend.js               # Email sending
│   │   ├── googleCalendar.js       # Calendar event creation
│   │   ├── tika.js                 # Resume text extraction
│   │   ├── faiss.js                # Vector similarity (optional)
│   │   └── demoStore.js            # In-memory demo store
│   └── server.js                   # Express app factory
│
├── supabase/
│   └── schema.sql                  # Full DB schema with RLS
│
├── public/                         # Static assets
├── .env                            # Local secrets (gitignored)
├── .env.example                    # Template for onboarding
├── next.config.mjs                 # Next.js config
├── package.json
├── ARCHITECTURE.md                 # This file
└── DEPLOYMENT.md                   # Deployment guide
```

## Key Design Decisions

### 1. Demo Mode First
All API routes check `supabaseConfigured` before using the real DB. If Supabase env vars are missing, the app uses an in-memory `demoStore.js`. This allows instant prototyping without external dependencies.

### 2. Auth Strategy
- Supabase Auth handles JWT issuance, refresh, and storage
- The Express server validates Bearer tokens via `supabaseAdmin.auth.getUser(token)`
- The frontend stores sessions in localStorage via `@supabase/ssr`
- Demo mode bypasses all auth checks and injects a fake `demo-user` identity

### 3. AI Layer
- **Resume parsing**: Gemini 2.0 Flash extracts structured JSON from resume text
- **Scoring**: Gemini compares candidate profile JSON vs job description JSON
- **Fallback**: If `GEMINI_API_KEY` is missing, deterministic mock scores are returned

### 4. Data Flow for Resume Upload
```
Browser (FormData) → POST /api/candidates/upload
  → multer (memory storage, 8 MB limit)
  → tika.js / pdf-parse / mammoth (text extraction)
  → gemini.js → parseResumeWithGemini(text)
  → candidates table INSERT
  → candidate_resumes table INSERT
  → Supabase Storage upload (optional)
  → Response: { candidate, resume }
```

### 5. RBAC
- Two roles: `admin` and `recruiter`
- Role stored in `profiles.role` column
- `requireRole('admin')` middleware factory guards admin-only routes
- Frontend reads `profile.role` from `useAuthUser()` hook to show/hide admin UI
