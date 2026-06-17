'use client';
import dynamic from 'next/dynamic';
import { useQuery } from '@tanstack/react-query';
import AppShell from '../_components/AppShell';
import StatCard from '../_components/StatCard';
import { apiGet } from '@/lib/api';

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
      {/* Page Header */}
      <div className="mb-8 animate-fade-in">
        <h1 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
          Recruitment Analytics
        </h1>
        <p className="mt-2 text-sm text-[#8b95b0]">
          Inspect candidate metrics, funnels, AI scoring spread, and weekly registration trends.
        </p>
      </div>

      {/* Stats row */}
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3 stagger-children">
        <StatCard 
          label="Total Candidates" 
          value={totals.candidates || 0} 
          hint="All profiles in the database" 
          accent="#6366f1"
          icon={
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
            </svg>
          }
        />
        <StatCard 
          label="Hired / Selected" 
          value={totals.selected || 0} 
          hint="Candidates with final selection" 
          accent="#10b981"
          icon={
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
          }
        />
        <StatCard 
          label="Rejected / Closed" 
          value={totals.rejected || 0} 
          hint="Profiles closed out in board" 
          accent="#f43f5e"
          icon={
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
          }
        />
        <StatCard 
          label="Average Score" 
          value={totals.averageScore ? `${totals.averageScore}%` : '0%'} 
          hint="Current pool match level" 
          accent="#06b6d4"
          icon={
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="20" x2="18" y2="10" />
              <line x1="12" y1="20" x2="12" y2="4" />
              <line x1="6" y1="20" x2="6" y2="14" />
            </svg>
          }
        />
      </div>

      <div className="animate-fade-in" style={{ animationDelay: '150ms' }}>
        <AnalyticsCharts
          funnel={funnel}
          scoreDistribution={scoreDistribution}
          weeklyTrend={weeklyTrend}
        />
      </div>
    </AppShell>
  );
}
