'use client';
import dynamic from 'next/dynamic';
import { useQuery } from '@tanstack/react-query';
import AppShell from '../_components/AppShell';
import StatCard from '../_components/StatCard';
import { getAnalyticsSummary } from '@/lib/recruitmentData';

const AnalyticsCharts = dynamic(() => import('../_components/AnalyticsCharts'), {
  ssr: false,
  loading: () => (
    <div className="space-y-6 mt-6">
      <div className="grid gap-6 xl:grid-cols-2">
        <div className="h-80 skeleton rounded-[28px] border border-white/5" />
        <div className="h-80 skeleton rounded-[28px] border border-white/5" />
      </div>
      <div className="h-80 skeleton rounded-[28px] border border-white/5" />
    </div>
  ),
});

export default function AnalyticsPage() {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['analytics-page'],
    queryFn: getAnalyticsSummary,
  });

  const totals = data?.totals || {};

  return (
    <AppShell>
      <div className="mb-8 animate-fade-in">
        <h1 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
          Recruitment Analytics
        </h1>
        <p className="mt-2 text-sm text-[#8b95b0]">
          Inspect funnel conversion, AI scoring, email automation, candidate reporting, and hiring trends.
        </p>
      </div>

      {isError && (
        <div className="alert alert-error mb-6">
          {error?.message || 'Could not load analytics.'}
        </div>
      )}

      {isLoading ? (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, index) => (
            <div key={index} className="h-32 rounded-[28px] skeleton border border-white/5" />
          ))}
        </div>
      ) : (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4 stagger-children">
          <StatCard label="Total Candidates" value={totals.candidates || 0} hint="All profiles in the database" accent="#6366f1" />
          <StatCard label="Shortlisted" value={totals.shortlisted || 0} hint="Candidates moved forward" accent="#f59e0b" />
          <StatCard label="Interviews" value={totals.interviewCount || totals.interviews || 0} hint="Scheduled interview records" accent="#8b5cf6" />
          <StatCard label="Selected / Hired" value={totals.hired || totals.selected || 0} hint="Final hiring outcomes" accent="#10b981" />
          <StatCard label="Rejected" value={totals.rejected || 0} hint="Closed applications" accent="#f43f5e" />
          <StatCard label="Average AI Score" value={totals.averageScore ? `${totals.averageScore}%` : '0%'} hint="Current pool match level" accent="#06b6d4" />
          <StatCard label="Emails Logged" value={totals.emails || 0} hint="Shortlist/rejection outreach" accent="#ec4899" />
          <StatCard label="Email Success Rate" value={`${totals.emailSuccessRate || 0}%`} hint={`${totals.emailsFailed || 0} failed sends`} accent="#22c55e" />
        </div>
      )}

      <div className="animate-fade-in" style={{ animationDelay: '150ms' }}>
        <AnalyticsCharts
          funnel={data?.funnel || []}
          scoreDistribution={data?.scoreDistribution || []}
          weeklyTrend={data?.weeklyTrend || data?.dailyApplications || []}
          topSkills={data?.topSkills || []}
          candidatesByJob={data?.candidatesByJob || []}
          experienceBreakdown={data?.experienceBreakdown || []}
          emailByType={data?.emailByType || []}
          emailByStatus={data?.emailByStatus || []}
          emailTrend={data?.emailTrend || []}
          recentActivity={data?.recentActivity || []}
          highScoreCandidates={data?.highScoreCandidates || []}
        />
      </div>
    </AppShell>
  );
}
