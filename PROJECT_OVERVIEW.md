# AI Recruitment CRM Project Overview

## Purpose

AI Recruitment CRM is a recruiting workflow application for uploading resumes, managing candidates and jobs, matching candidates to job descriptions with AI-assisted scoring, scheduling interviews, and viewing pipeline analytics. It can run in a real Supabase-backed mode or in a local demo mode when external credentials are missing.

## Stack

- **Frontend:** Next.js 16 App Router, React 19, Tailwind CSS v4, TanStack Query, Recharts
- **Backend:** Express 5 API, mounted either standalone or through Next.js API catch-all routing
- **Auth/database/storage:** Supabase Auth, Postgres, Storage, Row Level Security policies in schema
- **AI/parsing/search:** Gemini for resume parsing, scoring, and embeddings; token/cosine fallback matching; optional Apache Tika, `pdf-parse`, and `mammoth` for document extraction
- **Integrations:** Nodemailer/SMTP email automation, Google Calendar scheduling, optional OpenAI helper currently not wired into routes
- **Tooling/config:** npm, ESLint, PostCSS, `next build --webpack`, path alias `@/*` to `src/*`

## Folder Map

```text
Ai-Recruitment-CRM/
├─ src/
│  ├─ app/                         # Next.js App Router frontend pages and shared UI
│  │  ├─ _components/               # AppShell, providers, cards, charts, buttons, modals
│  │  ├─ page.js                    # Marketing/home page
│  │  ├─ login/page.js              # Login/sign-up page
│  │  ├─ reset-password/            # Password reset flow
│  │  ├─ dashboard/page.js          # CRM dashboard
│  │  ├─ candidates/page.js         # Candidate board/upload/search
│  │  ├─ candidates/[id]/page.js    # Candidate detail and scoring
│  │  ├─ jobs/page.js               # Job CRUD and matching view
│  │  ├─ analytics/page.js          # Charts and summary stats
│  │  └─ settings/page.js           # Env/integration checklist
│  ├─ lib/                          # Frontend API/auth helpers
│  └─ pages/api/[[...path]].js      # Next API bridge to Express app
├─ server/
│  ├─ server.js                     # Express app factory and standalone server entry
│  ├─ middleware/auth.js            # Supabase/demo auth middleware
│  ├─ routes/                       # API route modules
│  └─ lib/                          # Supabase, Gemini, Tika, Calendar, matching helpers
├─ supabase/schema.sql              # Database schema, policies, seed data
├─ package.json                     # Scripts and dependencies
├─ next.config.mjs                  # Next config and server externals
├─ postcss.config.mjs               # Tailwind v4 PostCSS config
├─ jsconfig.json                    # `@/*` path alias
└─ .env.example                     # Environment variable template
```

## Frontend Overview

The frontend is a Next.js 16 App Router app rooted at `src/app`. `src/app/layout.js` imports global styles, loads the Inter font, disables indexing through metadata, and wraps all routes with `Providers` for TanStack Query.

Shared UI is under `src/app/_components`. `AppShell.jsx` provides the CRM sidebar, mobile drawer, active navigation, profile display, and Supabase sign-out. Authenticated-looking pages manually wrap themselves in `AppShell`; there is no scanned frontend middleware or route-group guard.

Important frontend behavior:

- `src/lib/api.js` centralizes fetch calls, attaches Supabase Bearer tokens, retries once after token refresh on `401`, and supports JSON plus multipart upload.
- `src/lib/supabaseClient.js` creates the browser Supabase client when public env vars exist; otherwise it falls back to a stub/demo client.
- `src/lib/useAuthUser.js` keeps a module-level auth/profile singleton and loads `/api/me`.
- `src/app/globals.css` is the main design-system file with Tailwind v4 import, CSS variables, dark/glass styling, buttons, forms, cards, tables, kanban utilities, animations, focus styles, and scrollbars.
- Analytics charts dynamically load Recharts with `ssr: false` to avoid hydration/client-only problems.

## Backend Overview

The backend is an Express API created in `server/server.js`. It can run independently with `npm run server` or be mounted inside Next.js through `src/pages/api/[[...path]].js`, which forwards `/api/*` requests to the same Express app.

Request flow includes Helmet, CORS, JSON body parsing with a 5 MB limit, global rate limiting of 180 requests/minute, route-specific auth middleware, and a global error handler. The standalone server defaults to port `4000`.

Main backend areas:

- **Auth/profile:** `server/routes/auth/me.js`, `server/routes/auth/reset.js`
- **Candidates:** upload, parse, list, detail, stage update, notes, delete
- **Jobs:** create, read, update, delete, status toggle
- **Matching:** candidate/job scoring with Gemini embeddings and fallback similarity logic
- **Interviews:** Google Calendar event creation or demo event metadata
- **Emails:** Nodemailer/SMTP-backed shortlist/rejection previews, sends, templates, and logs
- **Analytics:** pipeline counts, score summaries, interview/email counts, funnel metrics, and candidate reporting

When Supabase env vars are missing, `server/lib/supabase.js` switches to demo mode with in-memory data. Demo records disappear after restart.

## Database and Schema Overview

The Supabase schema is defined in `supabase/schema.sql`. It creates the main CRM tables and policies, including:

- `profiles`
- `pipeline_stages`
- `candidates`
- `resumes`
- `jobs`
- `scores`
- `candidate_stage_history`
- `notes`
- `interviews`
- `email_logs`
- `email_templates`
- candidate/job embedding cache tables

The schema includes RLS policies and seed/default pipeline data. The backend often uses the Supabase service role client, so access control must also be enforced in route code. Some route helpers include fallback insert behavior for partially migrated databases, especially around candidates and notes.

Notable schema issue from the scan: `email_templates.type` appears to reference `email_logs` suspiciously rather than a specific lookup key or enum-like table/column.

## AI and Search Integrations

- **Gemini:** Active provider for resume parsing, candidate scoring, explanations, and 768-dimension embeddings. Implemented in `server/lib/gemini.js`.
- **Matching fallback:** `server/lib/faiss.js` is not a real FAISS index; it provides token/cosine-style utility scoring.
- **OpenAI helper:** `server/lib/openai.js` exists and supports 1536-dimension embeddings, but the scan found it is not imported by active backend routes. It is also currently untracked locally.
- **Resume text extraction:** Optional Apache Tika through `TIKA_SERVER_URL`, with local PDF/DOCX/text fallbacks using `pdf-parse` and `mammoth`.
- **Calendar:** `server/lib/googleCalendar.js` schedules Google Calendar interviews when OAuth/calendar env vars exist; otherwise it returns demo metadata.

## Environment Variables

Recognized/discoverable variables include:

```env
# App/API
NEXT_PUBLIC_API_URL=
FRONTEND_ORIGIN=
PORT=4000
NODE_ENV=development

# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_RESUME_BUCKET=resumes

# Gemini AI
GEMINI_API_KEY=
GEMINI_MODEL=
GEMINI_API_URL=

# Optional OpenAI helper
OPENAI_API_KEY=
OPENAI_MODEL=

# Resume extraction
TIKA_SERVER_URL=

# SMTP Email
SMTP_HOST=smtp.office365.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=
SMTP_PASS=
SMTP_FROM_EMAIL=
SMTP_FROM_NAME=AI Recruitment CRM

# Google Calendar
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REFRESH_TOKEN=
GOOGLE_CALENDAR_ID=
GOOGLE_REDIRECT_URI=
```

Important note: the scan reported that `.env.example` may contain a real-looking `GEMINI_API_KEY`; if valid, rotate it and remove the leaked value.

## How to Run

### Default integrated Next.js/API mode

```bash
npm install
cp .env.example .env
npm run dev
```

Open `http://localhost:3000`.

In this mode, frontend calls can use same-origin `/api/*` because `src/pages/api/[[...path]].js` mounts the Express app inside Next.js.

### Separate backend mode

Terminal 1:

```bash
npm run server
```

Terminal 2:

```bash
NEXT_PUBLIC_API_URL=http://localhost:4000 npm run dev
```

The standalone API exposes `/health` and `/api/*` on `http://localhost:4000` by default.

### Supabase setup

1. Run `supabase/schema.sql` in the Supabase SQL editor.
2. Create a private `resumes` storage bucket.
3. Enable/configure Supabase Auth.
4. Add Supabase URL, anon key, and service role key to `.env`.
5. Add Gemini, SMTP/Nodemailer, Google Calendar, and Tika variables as needed.

Without these credentials, the app can still run in demo mode with in-memory data and mock external behavior.

## Important Routes, Pages, and APIs

### Frontend pages

- `/` - marketing landing page
- `/login` - sign-in/sign-up, including demo behavior when Supabase is not configured
- `/reset-password` and `/reset-password/confirm` - reset flow
- `/dashboard` - analytics summary and recent candidates
- `/candidates` - upload resumes, search/filter, and Kanban pipeline
- `/candidates/[id]` - candidate detail, notes, scoring, scheduling, delete
- `/jobs` - job CRUD, status changes, matched candidates
- `/analytics` - charts and summary metrics
- `/settings` - environment and integration checklist

### Backend APIs

- `GET /health`
- `/api/me`
- `/api/auth/reset`
- `/api/candidates`
- `/api/candidates/:id`
- `/api/jobs`
- `/api/matching`
- `/api/interviews`
- `/api/emails`
- `/api/analytics`

Email delivery is handled server-side through `/api/emails/*` routes using Nodemailer with SMTP credentials. The API still runs through the integrated Next.js catch-all route in default deployment mode.

## Current Notable Local Modifications

The repository scan found local changes on branch `main`:

Modified files:

- `server/lib/faiss.js`
- `server/lib/gemini.js`
- `server/routes/candidates.js`
- `server/routes/jobs.js`
- `server/routes/matching.js`
- `src/app/candidates/[id]/page.js`
- `src/app/jobs/page.js`
- `src/app/login/page.js`
- `supabase/schema.sql`

Untracked file:

- `server/lib/openai.js`

No files were modified during the scan itself.

## Next-Step Notes

- Add route-level owner/admin filtering for real-mode backend reads/writes that currently use the Supabase service role client, especially candidates, jobs, matching, analytics, and related detail endpoints.
- Avoid returning stack traces from the global error handler in production.
- Decide whether `server/lib/openai.js` should be integrated, fixed, or removed. If used, verify its fetch import/runtime compatibility.
- Fix or confirm the suspicious `email_templates.type` reference in `supabase/schema.sql`.
- Add a real frontend auth guard or route protection strategy for CRM pages if unauthenticated access should be blocked.
- Rotate any real-looking API keys in `.env.example` and keep examples placeholder-only.
- Before changing Next.js code, follow `AGENTS.md` and read the relevant Next.js 16 docs under `node_modules/next/dist/docs/`.
