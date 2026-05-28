import Link from 'next/link';

export default function Home() {
  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col justify-center px-6 py-16">
        <div className="max-w-3xl rounded-[36px] border border-white/10 bg-white/[0.04] p-8 shadow-2xl shadow-slate-950/20 sm:p-12">
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-cyan-300">AI Recruitment CRM</p>
          <h1 className="mt-5 text-5xl font-semibold tracking-tight sm:text-6xl">
            A fast demo to parse resumes, rank candidates, and run a hiring pipeline.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-300">
            This app is built as a separate Desktop project so it stays clean from your existing Room30 marketplace code. It works in demo mode immediately and upgrades to real Supabase, Gemini, Resend, and Google Calendar flows when keys are connected.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/dashboard" className="rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200">
              Open dashboard
            </Link>
            <Link href="/candidates" className="rounded-2xl border border-white/15 px-5 py-3 text-sm font-medium text-white transition hover:bg-white/10">
              View candidates
            </Link>
          </div>

          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {[
              ['Resume parsing', 'Upload PDF/DOCX and turn resume text into structured candidate profiles.'],
              ['AI ranking', 'Score candidates against job descriptions with explanation and skill match.'],
              ['Workflow automation', 'Move candidates through the pipeline, send emails, and schedule interviews.'],
            ].map(([title, detail]) => (
              <div key={title} className="rounded-3xl border border-white/10 bg-slate-900/70 p-5">
                <h2 className="text-lg font-semibold">{title}</h2>
                <p className="mt-2 text-sm leading-6 text-slate-400">{detail}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
