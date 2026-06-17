import AppShell from '../_components/AppShell';
import SectionCard from '../_components/SectionCard';

const INTEGRATIONS = [
  {
    service: 'Supabase Data Engine',
    variables: 'NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY',
    desc: 'Powers persistent candidate database profiles, note structures, and stage transitions.',
    icon: (
      <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 7v10c0 2 1.5 3 3.5 3h9c2 0 3.5-1 3.5-3V7c0-2-1.5-3-3.5-3h-9C5.5 4 4 5 4 7z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 12h16" />
      </svg>
    )
  },
  {
    service: 'Google Gemini AI',
    variables: 'GEMINI_API_KEY',
    desc: 'Extracts structured JSON profiles from plain resume documents and calculates job matches.',
    icon: (
      <svg className="w-5 h-5 text-indigo-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
      </svg>
    )
  },
  {
    service: 'Resume File Parser',
    variables: 'TIKA_SERVER_URL (Optional fallback to pdf-parse / mammoth is pre-configured)',
    desc: 'Extracts raw plain text data from DOC, DOCX, and PDF formats.',
    icon: (
      <svg className="w-5 h-5 text-cyan-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    )
  },
  {
    service: 'Resend Outreach Mailer',
    variables: 'RESEND_API_KEY, RESEND_FROM_EMAIL',
    desc: 'Triggers outreach notification updates directly to candidate email addresses.',
    icon: (
      <svg className="w-5 h-5 text-pink-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
      </svg>
    )
  },
  {
    service: 'Google Calendar Sync',
    variables: 'GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN, GOOGLE_CALENDAR_ID',
    desc: 'Schedules calendar meetings and video-call attachments directly on recruiter calendar feeds.',
    icon: (
      <svg className="w-5 h-5 text-violet-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
        <line x1="16" y1="2" x2="16" y2="6" />
        <line x1="8" y1="2" x2="8" y2="6" />
        <line x1="3" y1="10" x2="21" y2="10" />
      </svg>
    )
  }
];

export default function SettingsPage() {
  return (
    <AppShell>
      {/* Page Header */}
      <div className="mb-8 animate-fade-in">
        <h1 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
          CRM Integrations
        </h1>
        <p className="mt-2 text-sm text-[#8b95b0]">
          Configure environment credentials to upgrade your workspace from sandbox sandbox mode to real API flows.
        </p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr] items-start animate-fade-in">
        {/* Left Column: checklist grid */}
        <SectionCard 
          title="Integrations Connection Panel" 
          description="Checklist variables required inside the server environment settings (.env)."
        >
          <div className="space-y-4">
            {INTEGRATIONS.map((item, idx) => (
              <div 
                key={idx} 
                className="rounded-2xl border border-white/5 bg-[#080d1a]/50 p-5 flex flex-col sm:flex-row sm:items-start gap-4 hover:bg-white/[0.025] hover:border-white/10 transition-all group"
              >
                {/* icon container */}
                <div className="w-10 h-10 rounded-xl bg-white/[0.03] border border-white/10 flex items-center justify-center flex-shrink-0 group-hover:bg-indigo-500/10 transition-colors">
                  {item.icon}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <h3 className="text-sm font-bold text-white group-hover:text-indigo-300 transition-colors">{item.service}</h3>
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[9px] font-bold bg-white/5 border border-white/5 text-slate-400">
                      Sandbox Available
                    </span>
                  </div>
                  <p className="text-xs text-[#8b95b0] leading-relaxed mb-3 font-normal">{item.desc}</p>
                  
                  <div className="rounded-lg bg-[#03050b]/80 border border-white/5 p-3 text-[10px] font-mono text-slate-400 break-all select-all">
                    <span className="text-indigo-300">Variables:</span> {item.variables}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>

        {/* Right Column: Demo guidelines */}
        <div className="space-y-6">
          <SectionCard 
            title="Sandbox Mode Policies" 
            description="The CRM runs immediately in-memory if external keys are missing."
          >
            <div className="space-y-5 text-xs sm:text-sm text-slate-300 leading-relaxed font-normal">
              <div className="flex gap-3">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 mt-2 flex-shrink-0" />
                <p>
                  <strong className="text-white font-bold block mb-0.5">Authentication</strong>
                  Falls back to sandbox simulation. Use username <code className="text-indigo-300 font-mono">demo@recruitcrm.local</code> with any password to sign in instantly.
                </p>
              </div>

              <div className="flex gap-3">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 mt-2 flex-shrink-0" />
                <p>
                  <strong className="text-white font-bold block mb-0.5">Gemini AI Model</strong>
                  Returns parsed profile metrics and matching alignments based on deterministic mock profiles until keys are added.
                </p>
              </div>

              <div className="flex gap-3">
                <span className="w-1.5 h-1.5 rounded-full bg-pink-400 mt-2 flex-shrink-0" />
                <p>
                  <strong className="text-white font-bold block mb-0.5">Outreach Emails</strong>
                  Email actions are printed to server console logs and registered as successful demo sends rather than failing.
                </p>
              </div>

              <div className="flex gap-3">
                <span className="w-1.5 h-1.5 rounded-full bg-violet-400 mt-2 flex-shrink-0" />
                <p>
                  <strong className="text-white font-bold block mb-0.5">Calendar & Video Links</strong>
                  Schedules mocked event links so that pipeline workflows are fully executable.
                </p>
              </div>

              <div className="flex gap-3">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mt-2 flex-shrink-0" />
                <p>
                  <strong className="text-white font-bold block mb-0.5">Persistent Storage</strong>
                  Saves records inside in-memory arrays until real PostgreSQL databases are connected via Supabase.
                </p>
              </div>
            </div>

            {/* Sandbox Status Badge */}
            <div className="mt-6 border-t border-white/5 pt-5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse" />
                <span className="text-xs font-bold text-white">Sandbox Mode Active</span>
              </div>
              <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Demo Suite v1.0</span>
            </div>
          </SectionCard>
        </div>
      </div>
    </AppShell>
  );
}
