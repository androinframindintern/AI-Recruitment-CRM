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

  // Helper for date string
  const todayStr = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  return (
    <AppShell>
      {/* Welcome Banner */}
      <div className="mb-8 animate-fade-in">
        <h1 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
          Welcome back, <span className="gradient-text bg-gradient-to-r from-indigo-300 to-cyan-300">Recruiter</span>
        </h1>
        <p className="mt-2 text-sm text-[#8b95b0] font-medium flex items-center gap-2">
          <svg className="w-4 h-4 text-indigo-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          {todayStr}
          <span className="w-1.5 h-1.5 rounded-full bg-slate-700" />
          <span>CRM Dashboard Overview</span>
        </p>
      </div>

      {/* Metrics Grid */}
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4 stagger-children">
        <StatCard 
          label="Total Candidates" 
          value={totals.candidates || 0} 
          hint="All profiles imported in CRM" 
          accent="#6366f1"
          icon={
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
          }
        />
        <StatCard 
          label="Shortlisted" 
          value={totals.shortlisted || 0} 
          hint="Candidates in active pipelines" 
          accent="#f59e0b"
          icon={
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
          }
        />
        <StatCard 
          label="Scheduled Interviews" 
          value={totals.interviews || 0} 
          hint="Active calendar invites" 
          accent="#8b5cf6"
          icon={
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
          }
        />
        <StatCard 
          label="Average AI Score" 
          value={totals.averageScore ? `${totals.averageScore}%` : '0%'} 
          hint="Aggregate profile matching" 
          accent="#06b6d4"
          icon={
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
            </svg>
          }
        />
      </div>

      {/* Main Sections */}
      <div className="mt-8 grid gap-6 xl:grid-cols-[1.25fr_0.75fr] animate-fade-in">
        {/* Recent Candidates */}
        <SectionCard
          title="Recent Candidate Profiles"
          description="Parsed profiles that are ready for matching and stage progression."
          actions={
            <Link href="/candidates" className="btn btn-secondary btn-xs font-semibold">
              Open Board
            </Link>
          }
        >
          {candidates.length ? (
            <div className="grid gap-3">
              {candidates.slice(0, 5).map((candidate) => {
                const score = candidate.latest_score?.score;
                return (
                  <Link 
                    key={candidate.id} 
                    href={`/candidates/${candidate.id}`} 
                    className="list-row group flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4 p-4 sm:p-5"
                  >
                    {/* Avatar initials fallback */}
                    <div className="w-10 h-10 rounded-xl bg-white/[0.03] border border-white/10 flex items-center justify-center font-bold text-white text-xs group-hover:border-indigo-500/30 group-hover:bg-indigo-500/5 transition-all flex-shrink-0">
                      {(candidate.full_name || 'C').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()}
                    </div>

                    <div className="flex-1 min-w-0 w-full">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-sm font-semibold text-white group-hover:text-indigo-300 transition-colors truncate">
                          {candidate.full_name}
                        </h3>
                        <span className={`badge ${
                          candidate.stage === 'selected' ? 'badge-emerald' :
                          candidate.stage === 'rejected' ? 'badge-rose' :
                          candidate.stage === 'shortlisted' ? 'badge-amber' :
                          candidate.stage === 'interview_scheduled' ? 'badge-violet' :
                          candidate.stage === 'parsed' ? 'badge-sky' : 'badge-indigo'
                        }`} style={{ fontSize: '9px', padding: '1px 8px' }}>
                          {candidate.stage || 'new'}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-[#8b95b0] truncate">
                        {candidate.current_title || 'Candidate profile'}
                        {candidate.current_company && ` at ${candidate.current_company}`}
                      </p>
                    </div>

                    {/* AI Score pill */}
                    <div className="text-left sm:text-right w-full sm:w-auto mt-2 sm:mt-0">
                      {score ? (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border border-cyan-400/20 bg-cyan-400/5 text-cyan-200">
                          <span className="w-1 h-1 rounded-full bg-cyan-400" />
                          {score}/100 Match
                        </span>
                      ) : (
                        <span className="text-xs text-[#3e4a65] font-medium">Unranked</span>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          ) : (
            <EmptyState
              title="No candidates registered"
              detail="Upload your first resume on the candidates page to fill the ATS pipeline."
              action={<Link href="/candidates" className="btn btn-primary btn-sm font-semibold">Upload Candidate</Link>}
            />
          )}
        </SectionCard>

        {/* Quick Focus Controls */}
        <div className="space-y-6">
          <SectionCard
            title="Recruiter Focus Flow"
            description="Quick setup links for checking the primary integrations."
          >
            <div className="grid gap-3">
              {[
                { 
                  href: '/candidates', 
                  title: 'Upload & Parse Resumes', 
                  detail: 'Import candidate files to extract profiles via AI.',
                  icon: (
                    <svg className="w-4 h-4 text-indigo-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                    </svg>
                  )
                },
                { 
                  href: '/jobs', 
                  title: 'Create Job Requirements', 
                  detail: 'Add job descriptions to compare candidates with AI.',
                  icon: (
                    <svg className="w-4 h-4 text-cyan-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  )
                },
                { 
                  href: '/analytics', 
                  title: 'Review System Funnel', 
                  detail: 'Inspect pipeline trends and matching score spreads.',
                  icon: (
                    <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                  )
                },
              ].map((item) => (
                <Link 
                  key={item.href} 
                  href={item.href} 
                  className="rounded-2xl border border-white/5 bg-white/[0.015] p-4 flex gap-3 transition-all hover:bg-white/[0.04] hover:border-white/10 group"
                >
                  <div className="w-8 h-8 rounded-lg bg-white/[0.03] flex items-center justify-center group-hover:bg-indigo-500/10 transition-colors flex-shrink-0">
                    {item.icon}
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-white group-hover:text-indigo-300 transition-colors">{item.title}</h3>
                    <p className="mt-1 text-xs text-[#8b95b0] leading-relaxed">{item.detail}</p>
                  </div>
                </Link>
              ))}
            </div>

            {/* Active jobs card */}
            <div className="mt-5 rounded-2xl border border-white/5 bg-white/[0.015] p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-white">Active System Jobs</p>
                <span className="badge badge-sky" style={{ fontSize: '9px' }}>Connected</span>
              </div>
              <p className="text-xs text-[#8b95b0] leading-relaxed">
                {jobs.length ? (
                  <span>Currently <strong className="text-white font-semibold">{jobs.length} roles</strong> configured and available for candidate AI alignment scoring.</span>
                ) : (
                  <span>Create a job description to initiate candidate AI scores.</span>
                )}
              </p>
            </div>
          </SectionCard>
        </div>
      </div>
    </AppShell>
  );
}
