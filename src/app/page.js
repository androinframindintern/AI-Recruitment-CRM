import Link from 'next/link';

export default function Home() {
  return (
    <div className="min-h-screen bg-[#04060f] text-[#f0f4ff] relative overflow-hidden flex flex-col justify-between">
      {/* Dynamic ambient backgrounds */}
      <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-gradient-to-tr from-indigo-600/20 to-cyan-500/20 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-0 right-1/4 w-[600px] h-[600px] bg-gradient-to-br from-violet-600/10 to-emerald-500/10 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-950/20 via-transparent to-transparent pointer-events-none" />

      {/* Header bar */}
      <header className="relative z-10 max-w-6xl mx-auto w-full px-6 py-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-cyan-400 flex items-center justify-center font-black text-white text-sm shadow-lg shadow-indigo-500/25">
            AI
          </div>
          <div>
            <span className="text-xs font-bold uppercase tracking-[0.2em] text-indigo-400 block">RecruitCRM</span>
            <span className="text-[10px] text-slate-400 block font-medium">Smart Hiring Suite</span>
          </div>
        </div>
        <Link 
          href="/dashboard" 
          className="btn btn-secondary btn-sm"
        >
          Open App
        </Link>
      </header>

      {/* Hero Body */}
      <main className="relative z-10 mx-auto max-w-6xl px-6 py-12 md:py-20 flex-1 flex flex-col justify-center items-center">
        <div className="max-w-4xl text-center">
          {/* Tagline */}
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-indigo-500/20 bg-indigo-500/10 text-indigo-300 text-xs font-semibold uppercase tracking-wider mb-6 animate-fade-in">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
            Next-Gen Candidate Matching
          </div>

          <h1 className="text-4xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight leading-tight text-white animate-fade-in-up">
            Supercharge Your Hiring with <span className="gradient-text bg-gradient-to-r from-indigo-300 via-cyan-200 to-emerald-200">AI Intelligence</span>
          </h1>

          <p className="mt-8 text-base sm:text-lg text-slate-400 max-w-2xl mx-auto leading-relaxed animate-fade-in-up" style={{ animationDelay: '100ms' }}>
            A powerful, intelligent ATS workspace. Parse resumes, perform instant semantic matching against jobs with Google Gemini AI, track candidates on a Kanban board, and automate recruiter outreach.
          </p>

          {/* CTA Group */}
          <div className="mt-10 flex flex-wrap justify-center gap-4 animate-fade-in-up" style={{ animationDelay: '200ms' }}>
            <Link 
              href="/dashboard" 
              className="btn btn-primary btn-lg shadow-xl shadow-indigo-600/30 font-semibold"
            >
              Get Started Free
              <svg className="w-4 h-4 ml-1" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </Link>
            <Link 
              href="/candidates" 
              className="btn btn-secondary btn-lg font-semibold"
            >
              View Candidate Board
            </Link>
          </div>
        </div>

        {/* Feature Cards Grid */}
        <div className="mt-20 grid gap-6 md:grid-cols-3 w-full max-w-5xl stagger-children" style={{ animationDelay: '300ms' }}>
          {[
            {
              title: 'AI Resume Extraction',
              description: 'Drop PDF or Word files. Our AI parses and converts plain document text into clean, structured candidate profiles.',
              icon: (
                <svg className="w-6 h-6 text-indigo-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              ),
              glow: 'rgba(99, 102, 241, 0.15)'
            },
            {
              title: 'AI Job Ranking',
              description: 'Instantly score candidates against active jobs. Gain descriptive match justifications, strengths, and missing skills.',
              icon: (
                <svg className="w-6 h-6 text-cyan-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              ),
              glow: 'rgba(6, 182, 212, 0.15)'
            },
            {
              title: 'Hiring Automation',
              description: 'Coordinate applicant stages visually. Draft auto-outreach messages, sync calendars, and log feedback notes smoothly.',
              icon: (
                <svg className="w-6 h-6 text-emerald-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              ),
              glow: 'rgba(16, 185, 129, 0.15)'
            }
          ].map((feat, idx) => (
            <div 
              key={idx} 
              className="glass-card p-6 flex flex-col gap-4 text-left transition-all duration-300 hover:scale-[1.02] hover:-translate-y-1"
              style={{ 
                boxShadow: `0 4px 30px rgba(0,0,0,0.2), inset 0 0 20px ${feat.glow}`
              }}
            >
              <div className="w-12 h-12 rounded-xl bg-white/[0.03] border border-white/10 flex items-center justify-center">
                {feat.icon}
              </div>
              <div>
                <h2 className="text-lg font-bold text-white tracking-wide">{feat.title}</h2>
                <p className="mt-2 text-sm leading-relaxed text-slate-400">{feat.description}</p>
              </div>
            </div>
          ))}
        </div>
      </main>

      {/* Footer bar */}
      <footer className="relative z-10 py-6 border-t border-white/5 bg-[#03050b]/40 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500 font-medium">
          <p>© {new Date().getFullYear()} AI RecruitCRM. All rights reserved.</p>
          <div className="flex gap-6">
            <span className="hover:text-slate-400 cursor-pointer">Privacy Policy</span>
            <span className="hover:text-slate-400 cursor-pointer">Terms of Service</span>
            <span className="hover:text-slate-400 cursor-pointer">Demo Mode</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
