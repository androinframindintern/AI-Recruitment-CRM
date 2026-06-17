# AI Recruitment CRM — Deployment Guide

## Prerequisites

- Node.js 20+
- npm 10+
- Supabase project (free tier works)
- Gemini API key (Google AI Studio)
- Resend account (email)
- Google Cloud project (Calendar API)

---

## 1. Local Development

```bash
# Clone the repo
git clone https://github.com/YOUR_ORG/ai-recruitment-crm.git
cd ai-recruitment-crm

# Install dependencies
npm install

# Copy env template
cp .env.example .env

# Fill in .env with your real values, then:
npm run dev
# App runs on http://localhost:3000
```

### Run with Separate Express Server (optional)

```bash
# Terminal 1 — Next.js frontend
npm run dev

# Terminal 2 — Express backend
npm run server
# API runs on http://localhost:4000

# In .env set:
# NEXT_PUBLIC_API_URL=http://localhost:4000
```

---

## 2. Database Setup (Supabase)

1. Create a new Supabase project at https://app.supabase.com
2. Go to **SQL Editor** and paste the full contents of `supabase/schema.sql`
3. Click **Run** — all tables, RLS policies, and triggers will be created
4. In **Storage**, create a bucket named `resumes` (make it **private**)
5. Copy API keys from **Settings → API** into your `.env`

---

## 3. Environment Variables

| Variable | Required | Description |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anonymous key |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Server-side service role key |
| `GEMINI_API_KEY` | Yes | Google Gemini API key |
| `RESEND_API_KEY` | Optional | Email sending |
| `RESEND_FROM_EMAIL` | Optional | Verified sender email |
| `GOOGLE_CLIENT_ID` | Optional | Google Calendar OAuth client |
| `GOOGLE_CLIENT_SECRET` | Optional | Google Calendar OAuth secret |
| `GOOGLE_REFRESH_TOKEN` | Optional | Pre-authorized refresh token |

---

## 4. Production Deployment — Vercel (Recommended)

```bash
npm install -g vercel
vercel --prod
```

In Vercel dashboard → **Settings → Environment Variables**, add all values from `.env`.

**Important:** Leave `NEXT_PUBLIC_API_URL` empty on Vercel (uses Next.js API routes natively).

### vercel.json (create in project root)

```json
{
  "buildCommand": "npm run build",
  "outputDirectory": ".next",
  "framework": "nextjs"
}
```

---

## 5. Production Deployment — VPS / Docker

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
```

```bash
docker build -t ai-recruitment-crm .
docker run -p 3000:3000 --env-file .env ai-recruitment-crm
```

---

## 6. Environments

| Environment | URL | Branch | Notes |
|---|---|---|---|
| Development | `http://localhost:3000` | `main` | Demo mode if no keys |
| Staging | `https://staging.yourdomain.com` | `staging` | Separate Supabase project |
| Production | `https://app.yourdomain.com` | `production` | Real Supabase + all keys |

---

## 7. First Login

After deploying with Supabase connected:

1. Visit `/login`
2. Click **"Need an account?"** to register
3. First registered user should be promoted to `admin` via Supabase SQL:

```sql
UPDATE profiles SET role = 'admin' WHERE email = 'your@email.com';
```

---

## 8. Google Calendar OAuth Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a project → Enable **Google Calendar API**
3. Create **OAuth 2.0 credentials** (Web application)
4. Add `https://developers.google.com/oauthplayground` as redirect URI
5. Visit [OAuth Playground](https://developers.google.com/oauthplayground)
6. Authorize `https://www.googleapis.com/auth/calendar`
7. Exchange auth code for tokens → copy refresh token to `GOOGLE_REFRESH_TOKEN`
