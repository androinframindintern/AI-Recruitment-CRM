# AI Recruitment CRM Project Notes

## What This Project Is

AI Recruitment CRM is a Next.js 16 + React 19 recruitment dashboard. It is built for resume upload/parsing, candidate pipeline tracking, job creation, AI candidate scoring, interview scheduling, email sending, and analytics.

The app has two main parts:

- `src/app`: Next.js frontend pages and shared UI components.
- `server`: Express API routes for candidates, jobs, matching, interviews, emails, analytics, and auth.

There is also a Supabase schema in `supabase/schema.sql`.

## Main Tech Stack

- Next.js `16.2.6`
- React `19.2.4`
- Tailwind CSS `4`
- Express `5`
- Supabase auth/database/storage
- Gemini API for resume parsing and candidate scoring
- Resend for recruitment emails
- Google Calendar API for interview scheduling
- Tika server optional for resume text extraction

Important project note: `AGENTS.md` says this Next.js version has breaking changes, so before changing Next-specific code, read the relevant files in `node_modules/next/dist/docs/`. At the moment `node_modules` is not installed in this folder, so those docs are not available yet.

## Current App Structure

- `/` landing page
- `/dashboard` recruiter overview
- `/candidates` candidate list and upload flow
- `/candidates/[id]` candidate detail page
- `/jobs` job management
- `/analytics` hiring analytics
- `/settings` integration checklist
- `/login` Supabase login/sign-up screen

Reusable frontend components are in `src/app/_components`.

## API Structure

The Express app is created in `server/server.js`.

Routes:

- `/api/me`
- `/api/candidates`
- `/api/jobs`
- `/api/matching`
- `/api/interviews`
- `/api/emails`
- `/api/analytics`
- `/health`

The file `src/pages/api/[[...path]].js` mounts the Express app inside Next.js API routes. Because of this, the app can run API calls through the Next dev server when `NEXT_PUBLIC_API_URL` is empty.

You can also run Express separately with `npm run server`, usually on port `4000`. In that case the frontend should use:

```env
NEXT_PUBLIC_API_URL=http://localhost:4000
FRONTEND_ORIGIN=http://localhost:3000
```

## Environment Variables Needed

Minimum for local demo mode:

```env
NEXT_PUBLIC_API_URL=
```

The app has demo fallbacks, so it can open without real external keys. For production or real data, configure these:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_RESUME_BUCKET=resumes

GEMINI_API_KEY=
GEMINI_MODEL=gemini-2.0-flash
GEMINI_API_URL=https://generativelanguage.googleapis.com/v1beta

RESEND_API_KEY=
RESEND_FROM_EMAIL=

GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REFRESH_TOKEN=
GOOGLE_CALENDAR_ID=
GOOGLE_REDIRECT_URI=https://developers.google.com/oauthplayground

TIKA_SERVER_URL=
FRONTEND_ORIGIN=http://localhost:3000
PORT=4000
```

## What Is Needed To Run Properly

1. Install Node.js, preferably a current LTS version.
2. Run `npm install` because `node_modules` is currently missing.
3. Create `.env.local` for the frontend values and `.env` for the Express server values, or keep all needed values available in the shell environment.
4. For demo mode, run:

```bash
npm run dev
```

Then open:

```text
http://localhost:3000
```

5. For separate backend mode, run two terminals:

```bash
npm run server
npm run dev
```

Use `NEXT_PUBLIC_API_URL=http://localhost:4000` in the frontend environment.

6. For real database mode, run the SQL in `supabase/schema.sql` inside Supabase and create the resume storage bucket, default name `resumes`.
7. For real auth, enable Supabase email/password auth and provide the public anon key to the frontend.
8. For real AI parsing/scoring, add `GEMINI_API_KEY`.
9. For real email delivery, add Resend credentials.
10. For real interview scheduling, add Google Calendar OAuth credentials and a calendar id.

## Useful Commands

```bash
npm run dev
npm run build
npm run start
npm run lint
npm run server
```

## Important Notes

- The backend uses in-memory demo data when Supabase is not configured, so demo records disappear when the server restarts.
- Resume uploads are limited to 8 MB.
- If `TIKA_SERVER_URL` is not configured, the project uses local extraction fallbacks.
- `next.config.mjs` allows images from Supabase public storage.
- `README.md` is still mostly the default Next.js readme and should be replaced later with project-specific setup docs.
