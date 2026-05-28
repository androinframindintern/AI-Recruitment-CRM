'use client';
import dynamic from 'next/dynamic';
import { useQuery } from '@tanstack/react-query';
import AppShell from '../_components/AppShell';
import StatCard from '../_components/StatCard';
import { apiGet } from '@/lib/api';

const AnalyticsCharts = dynamic(() => import('../_components/AnalyticsCharts'), {
  ssr: false,
  loading: () => (
    <>
      <div className="mt-6 h-80 rounded-[28px] border border-white/10 bg-slate-900/60" />
      <div className="mt-6 h-80 rounded-[28px] border border-white/10 bg-slate-900/60" />
    </>
  ),
});

export default function AnalyticsPage() {
  const { data } = useQuery({
    queryKey: ['analytics-page'],
    queryFn: () => apiGet('/api/analytics/summary', { auth: true }),
  });

  const totals = data?.totals || {};
  const funnel = data?.funnel || [];
  const scoreDistribution = data?.scoreDistribution || [];
  const weeklyTrend = data?.weeklyTrend || [];

  return (
    <AppShell>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total candidates" value={totals.candidates || 0} hint="Parsed profiles in the CRM" />
        <StatCard label="Selected" value={totals.selected || 0} hint="Candidates who reached the final decision" />
        <StatCard label="Rejected" value={totals.rejected || 0} hint="Profiles closed out in the current funnel" />
        <StatCard label="Average score" value={`${totals.averageScore || 0}%`} hint="How strong the current pipeline looks" />
      </div>

      <AnalyticsCharts
        funnel={funnel}
        scoreDistribution={scoreDistribution}
        weeklyTrend={weeklyTrend}
      />
    </AppShell>
  );
}
