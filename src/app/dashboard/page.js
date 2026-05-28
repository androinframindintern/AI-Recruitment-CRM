'use client';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import AppShell from '../_components/AppShell';
import EmptyState from '../_components/EmptyState';
import SectionCard from '../_components/SectionCard';
import StatCard from '../_components/StatCard';
import { apiGet } from '@/lib/api';

export default function DashboardPage() {
  const { data: analytics } = useQuery({
    queryKey: ['analytics-summary'],
    queryFn: () => apiGet('/api/analytics/summary', { auth: true }),
  });
  const { data: candidatesResponse } = useQuery({
    queryKey: ['dashboard-candidates'],
    queryFn: () => apiGet('/api/candidates', { auth: true }),
  });
  const { data: jobsResponse } = useQuery({
    queryKey: ['dashboard-jobs'],
    queryFn: () => apiGet('/api/jobs', { auth: true }),
  });

  const totals = analytics?.totals || {};
  const candidates = candidatesResponse?.candidates || [];
  const jobs = jobsResponse?.jobs || [];

  return (
    <AppShell>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Candidates" value={totals.candidates || 0} hint="All resumes imported into the CRM" />
        <StatCard label="Shortlisted" value={totals.shortlisted || 0} hint="Candidates ready for recruiter action" />
        <StatCard label="Interviews" value={totals.interviews || 0} hint="Scheduled interview events" />
        <StatCard label="Average AI score" value={`${totals.averageScore || 0}%`} hint="Overall score quality across matches" />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <SectionCard
          title="Recent candidates"
          description="The newest parsed profiles are ready for ranking and stage updates."
          actions={<Link href="/candidates" className="rounded-2xl bg-white px-4 py-2 text-sm font-semibold text-slate-950">Open board</Link>}
        >
          {candidates.length ? (
            <div className="grid gap-3">
              {candidates.slice(0, 5).map((candidate) => (
                <Link key={candidate.id} href={`/candidates/${candidate.id}`} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 transition hover:bg-white/[0.06]">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <h3 className="text-base font-semibold text-white">{candidate.full_name}</h3>
                      <p className="mt-1 text-sm text-slate-400">{candidate.current_title || 'Candidate profile'} {candidate.current_company ? `· ${candidate.current_company}` : ''}</p>
                    </div>
                    <div className="text-sm text-cyan-300">{candidate.latest_score?.score ? `${candidate.latest_score.score}/100` : 'Not scored yet'}</div>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <EmptyState
              title="No candidates yet"
              detail="Upload the first resume on the candidates page to populate the hiring pipeline."
              action={<Link href="/candidates" className="rounded-2xl bg-white px-4 py-2 text-sm font-semibold text-slate-950">Go to candidates</Link>}
            />
          )}
        </SectionCard>

        <SectionCard
          title="Recruiter focus"
          description="Quick actions for the most important demo flows."
        >
          <div className="grid gap-3">
            {[
              { href: '/candidates', title: 'Upload resume', detail: 'Parse a PDF or DOCX and create a structured candidate profile.' },
              { href: '/jobs', title: 'Create a job', detail: 'Store the job description you want candidates matched against.' },
              { href: '/analytics', title: 'Review analytics', detail: 'Show funnel performance and score distribution in the demo.' },
            ].map((item) => (
              <Link key={item.href} href={item.href} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 transition hover:bg-white/[0.06]">
                <h3 className="font-semibold text-white">{item.title}</h3>
                <p className="mt-1 text-sm text-slate-400">{item.detail}</p>
              </Link>
            ))}
          </div>
          <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-slate-300">
            <p className="font-semibold text-white">Jobs in system</p>
            <p className="mt-2">{jobs.length ? `${jobs.length} active roles ready for AI scoring.` : 'Create a job description to unlock candidate scoring.'}</p>
          </div>
        </SectionCard>
      </div>
    </AppShell>
  );
}
