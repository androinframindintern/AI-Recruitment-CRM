'use client';
import { useState, useEffect } from 'react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

const GRID = 'rgba(255,255,255,0.03)';
const AXIS = '#3e4a65';
const COLORS = {
  cyan: '#06b6d4',
  indigo: '#6366f1',
  emerald: '#10b981',
  amber: '#f59e0b',
  rose: '#f43f5e',
  violet: '#8b5cf6',
  slate: '#94a3b8',
};

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="glass-card p-3 shadow-xl text-xs font-bold text-white bg-[#04060f]/90 border border-white/10 rounded-xl">
      <p className="text-[#8b95b0] mb-2">{label}</p>
      <div className="space-y-1.5">
        {payload.map((item) => (
          <p key={`${item.name}-${item.dataKey}`} className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: item.stroke || item.fill || COLORS.indigo }} />
            <span className="capitalize text-slate-300">{item.name}:</span>
            <span className="text-white font-black">{item.value}</span>
          </p>
        ))}
      </div>
    </div>
  );
}

function ChartCard({ title, description, children }) {
  return (
    <section className="glass-card p-6 shadow-2xl">
      <div>
        <h3 className="text-base font-bold text-white tracking-wide">{title}</h3>
        {description && <p className="mt-1 text-xs text-[#8b95b0]">{description}</p>}
      </div>
      <div className="mt-6 h-80 min-w-0">{children}</div>
    </section>
  );
}

function EmptyChart({ message = 'No data available yet.' }) {
  return (
    <div className="flex h-full items-center justify-center rounded-2xl border border-white/5 bg-white/[0.012] text-xs font-semibold text-slate-500">
      {message}
    </div>
  );
}

function axisProps() {
  return {
    stroke: AXIS,
    tickLine: false,
    axisLine: false,
    style: { fontSize: 10, fontWeight: 600 },
  };
}

export default function AnalyticsCharts({
  funnel = [],
  scoreDistribution = [],
  weeklyTrend = [],
  topSkills = [],
  candidatesByJob = [],
  experienceBreakdown = [],
  emailByType = [],
  emailByStatus = [],
  emailTrend = [],
  recentActivity = [],
  highScoreCandidates = [],
}) {
  const [hasMounted, setHasMounted] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHasMounted(true);
  }, []);

  if (!hasMounted) {
    return (
      <div className="space-y-6">
        <div className="mt-6 grid gap-6 xl:grid-cols-2">
          <div className="glass-card p-6 shadow-2xl h-80 skeleton rounded-[28px] border border-white/5" />
          <div className="glass-card p-6 shadow-2xl h-80 skeleton rounded-[28px] border border-white/5" />
        </div>
        <div className="glass-card p-6 shadow-2xl h-80 skeleton rounded-[28px] border border-white/5" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <ChartCard title="Recruitment Funnel" description="Candidate progression and conversion percentages across the hiring journey.">
          {funnel.length ? (
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={funnel} barSize={26}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
                <XAxis dataKey="stage" {...axisProps()} />
                <YAxis {...axisProps()} allowDecimals={false} />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.015)' }} />
                <Bar dataKey="count" name="Candidates" fill={COLORS.cyan} radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <EmptyChart />}
        </ChartCard>

        <ChartCard title="Funnel Conversion" description="Overall conversion rate from applied candidates to each milestone.">
          {funnel.length ? (
            <ResponsiveContainer width="100%" height={320}>
              <LineChart data={funnel}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
                <XAxis dataKey="stage" {...axisProps()} />
                <YAxis {...axisProps()} unit="%" domain={[0, 100]} />
                <Tooltip content={<CustomTooltip />} />
                <Line type="monotone" dataKey="overallRate" name="Overall %" stroke={COLORS.emerald} strokeWidth={3} dot={{ r: 4, stroke: COLORS.emerald, strokeWidth: 2, fill: '#080d1a' }} />
              </LineChart>
            </ResponsiveContainer>
          ) : <EmptyChart />}
        </ChartCard>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <ChartCard title="AI Score Spread" description="Overall qualification levels across active matches.">
          {scoreDistribution.length ? (
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={scoreDistribution} barSize={28}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
                <XAxis dataKey="label" {...axisProps()} />
                <YAxis {...axisProps()} allowDecimals={false} />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.015)' }} />
                <Bar dataKey="count" name="Candidates" fill={COLORS.indigo} radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <EmptyChart />}
        </ChartCard>

        <ChartCard title="Experience Breakdown" description="Candidate experience distribution by years in role.">
          {experienceBreakdown.length ? (
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={experienceBreakdown} barSize={28}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
                <XAxis dataKey="label" {...axisProps()} />
                <YAxis {...axisProps()} allowDecimals={false} />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.015)' }} />
                <Bar dataKey="count" name="Candidates" fill={COLORS.violet} radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <EmptyChart />}
        </ChartCard>
      </div>

      <ChartCard title="Applicant Inflow" description="Daily candidate applications and profile creation trend.">
        {weeklyTrend.length ? (
          <ResponsiveContainer width="100%" height={320}>
            <AreaChart data={weeklyTrend}>
              <defs>
                <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={COLORS.emerald} stopOpacity={0.2}/>
                  <stop offset="95%" stopColor={COLORS.emerald} stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
              <XAxis dataKey="date" {...axisProps()} />
              <YAxis {...axisProps()} allowDecimals={false} />
              <Tooltip content={<CustomTooltip />} />
              <Area type="monotone" dataKey="count" name="New Profiles" stroke={COLORS.emerald} strokeWidth={3} fillOpacity={1} fill="url(#colorCount)" dot={{ r: 4, stroke: COLORS.emerald, strokeWidth: 2, fill: '#080d1a' }} />
            </AreaChart>
          </ResponsiveContainer>
        ) : <EmptyChart />}
      </ChartCard>

      <div className="grid gap-6 xl:grid-cols-2">
        <ChartCard title="Top Candidate Skills" description="Most common skills found in candidate profiles.">
          {topSkills.length ? (
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={topSkills} layout="vertical" margin={{ left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID} horizontal={false} />
                <XAxis type="number" {...axisProps()} allowDecimals={false} />
                <YAxis type="category" dataKey="skill" {...axisProps()} width={95} />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.015)' }} />
                <Bar dataKey="count" name="Candidates" fill={COLORS.amber} radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <EmptyChart />}
        </ChartCard>

        <ChartCard title="Candidates by Job" description="Candidate matches grouped by linked job openings.">
          {candidatesByJob.length ? (
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={candidatesByJob} barSize={24}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
                <XAxis dataKey="title" {...axisProps()} />
                <YAxis {...axisProps()} allowDecimals={false} />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.015)' }} />
                <Bar dataKey="count" name="Candidates" fill={COLORS.cyan} radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <EmptyChart />}
        </ChartCard>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <ChartCard title="Email Automation Volume" description="Email activity by template type and delivery state.">
          {(emailByType.length || emailByStatus.length) ? (
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={[...emailByType, ...emailByStatus]} barSize={24}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
                <XAxis dataKey="label" {...axisProps()} />
                <YAxis {...axisProps()} allowDecimals={false} />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.015)' }} />
                <Bar dataKey="count" name="Emails" fill={COLORS.rose} radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <EmptyChart message="No emails logged yet." />}
        </ChartCard>

        <ChartCard title="Email Trend" description="Daily email sends, demo sends, and failures.">
          {emailTrend.length ? (
            <ResponsiveContainer width="100%" height={320}>
              <LineChart data={emailTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
                <XAxis dataKey="date" {...axisProps()} />
                <YAxis {...axisProps()} allowDecimals={false} />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ color: '#94a3b8', fontSize: 11 }} />
                <Line type="monotone" dataKey="sent" name="Sent" stroke={COLORS.emerald} strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="failed" name="Failed" stroke={COLORS.rose} strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="demo" name="Demo" stroke={COLORS.amber} strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          ) : <EmptyChart message="No email trend data yet." />}
        </ChartCard>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="glass-card p-6 shadow-2xl">
          <h3 className="text-base font-bold text-white tracking-wide">High Score Candidates</h3>
          <p className="mt-1 text-xs text-[#8b95b0]">Candidates with AI match scores of 80% or above.</p>
          <div className="mt-5 space-y-3">
            {highScoreCandidates.length ? highScoreCandidates.map((candidate) => (
              <div key={candidate.id} className="rounded-xl border border-white/5 bg-white/[0.015] px-4 py-3">
                <p className="text-sm font-bold text-white">{candidate.name}</p>
                <p className="mt-1 text-xs capitalize text-slate-500">{candidate.stage?.replace(/_/g, ' ') || 'candidate'}</p>
              </div>
            )) : <p className="text-xs text-slate-600">No high score candidates yet.</p>}
          </div>
        </section>

        <section className="glass-card p-6 shadow-2xl">
          <h3 className="text-base font-bold text-white tracking-wide">Recent Activity</h3>
          <p className="mt-1 text-xs text-[#8b95b0]">Latest candidate, email, interview, and stage events.</p>
          <div className="mt-5 space-y-3">
            {recentActivity.length ? recentActivity.map((item, index) => (
              <div key={item.id || `${item.created_at}-${index}`} className="rounded-xl border border-white/5 bg-white/[0.015] px-4 py-3">
                <p className="text-xs font-bold text-white">{item.label || item.full_name || item.subject || 'Activity'}</p>
                <p className="mt-1 text-[10px] uppercase tracking-wider text-slate-500">{item.created_at ? new Date(item.created_at).toLocaleString() : 'Recent'}</p>
              </div>
            )) : <p className="text-xs text-slate-600">No recent activity yet.</p>}
          </div>
        </section>
      </div>
    </div>
  );
}
