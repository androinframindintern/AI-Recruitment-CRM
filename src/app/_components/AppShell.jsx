'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuthUser } from '@/lib/useAuthUser';

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/candidates', label: 'Candidates' },
  { href: '/jobs', label: 'Jobs' },
  { href: '/analytics', label: 'Analytics' },
  { href: '/settings', label: 'Settings' },
];

export default function AppShell({ children }) {
  const pathname = usePathname();
  const { profile } = useAuthUser();

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col lg:flex-row">
        <aside className="border-b border-white/10 bg-slate-900/70 p-4 lg:w-72 lg:border-b-0 lg:border-r lg:p-6">
          <Link href="/dashboard" className="block rounded-3xl bg-gradient-to-br from-indigo-500 to-cyan-400 p-5 text-slate-950">
            <p className="text-xs font-semibold uppercase tracking-[0.24em]">AI Recruitment CRM</p>
            <h1 className="mt-3 text-2xl font-semibold tracking-tight">Smart hiring demo</h1>
            <p className="mt-2 text-sm text-slate-900/80">Parse resumes, rank candidates, schedule interviews, and track hiring in one flow.</p>
          </Link>

          <nav className="mt-6 grid gap-2">
            {NAV_ITEMS.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`rounded-2xl px-4 py-3 text-sm font-medium transition ${active ? 'bg-white text-slate-950' : 'text-slate-300 hover:bg-white/5 hover:text-white'}`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="mt-8 rounded-3xl border border-white/10 bg-white/5 p-4 text-sm text-slate-300">
            <p className="font-semibold text-white">Signed in as</p>
            <p className="mt-1">{profile?.full_name || 'Demo Recruiter'}</p>
            <p className="text-xs uppercase tracking-[0.18em] text-slate-400">{profile?.role || 'recruiter'}</p>
          </div>
        </aside>

        <div className="flex-1">
          <header className="border-b border-white/10 px-4 py-4 sm:px-6 lg:px-8">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-cyan-300">Demo workspace</p>
                <h2 className="mt-1 text-2xl font-semibold tracking-tight">Recruit faster with AI-assisted workflows</h2>
              </div>
              <div className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-4 py-2 text-sm text-emerald-200">
                Local demo mode stays usable before external keys are connected.
              </div>
            </div>
          </header>
          <main className="px-4 py-6 sm:px-6 lg:px-8">{children}</main>
        </div>
      </div>
    </div>
  );
}
