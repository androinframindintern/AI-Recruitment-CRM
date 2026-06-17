'use client';
import { useState, useEffect } from 'react';
import { BarChart, Bar, CartesianGrid, LineChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis, AreaChart, Area } from 'recharts';

function CustomTooltip({ active, payload, label }) {
  if (active && payload && payload.length) {
    return (
      <div className="glass-card p-3 shadow-xl text-xs font-bold text-white bg-[#04060f]/90 border border-white/10 rounded-xl">
        <p className="text-[#8b95b0] mb-1">{label}</p>
        <p className="flex items-center gap-2">
          <span 
            className="w-2 h-2 rounded-full" 
            style={{ backgroundColor: payload[0].stroke || payload[0].fill || '#818cf8' }} 
          />
          <span className="capitalize">{payload[0].name}:</span>
          <span className="text-white font-black">{payload[0].value}</span>
        </p>
      </div>
    );
  }
  return null;
}

export default function AnalyticsCharts({ funnel, scoreDistribution, weeklyTrend }) {
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
      {/* Funnel and Score Distribution columns */}
      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        {/* Hiring Funnel Card */}
        <section className="glass-card p-6 shadow-2xl">
          <div>
            <h3 className="text-base font-bold text-white tracking-wide">Hiring Funnel Distribution</h3>
            <p className="mt-1 text-xs text-[#8b95b0]">Candidate progression metrics across pipeline stages.</p>
          </div>
          <div className="mt-6 h-80 min-w-0">
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={funnel} barSize={28}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" vertical={false} />
                <XAxis 
                  dataKey="stage" 
                  stroke="#3e4a65" 
                  tickLine={false} 
                  axisLine={false} 
                  style={{ fontSize: 10, fontWeight: 600 }}
                />
                <YAxis 
                  stroke="#3e4a65" 
                  tickLine={false} 
                  axisLine={false} 
                  allowDecimals={false}
                  style={{ fontSize: 10, fontWeight: 600 }}
                />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.015)' }} />
                <Bar dataKey="count" name="Candidates" fill="#06b6d4" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* AI Score Distribution Card */}
        <section className="glass-card p-6 shadow-2xl">
          <div>
            <h3 className="text-base font-bold text-white tracking-wide">AI Score Spread</h3>
            <p className="mt-1 text-xs text-[#8b95b0]">Overall qualification levels across active matches.</p>
          </div>
          <div className="mt-6 h-80 min-w-0">
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={scoreDistribution} barSize={28}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" vertical={false} />
                <XAxis 
                  dataKey="label" 
                  stroke="#3e4a65" 
                  tickLine={false} 
                  axisLine={false} 
                  style={{ fontSize: 10, fontWeight: 600 }}
                />
                <YAxis 
                  stroke="#3e4a65" 
                  tickLine={false} 
                  axisLine={false} 
                  allowDecimals={false}
                  style={{ fontSize: 10, fontWeight: 600 }}
                />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.015)' }} />
                <Bar dataKey="count" name="Candidates" fill="#6366f1" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>

      {/* Weekly Intake Trend Area Chart */}
      <div className="glass-card p-6 shadow-2xl">
        <div>
          <h3 className="text-base font-bold text-white tracking-wide">Weekly Applicant Inflow</h3>
          <p className="mt-1 text-xs text-[#8b95b0]">Dynamic trend line of newly registered candidate profiles.</p>
        </div>
        <div className="mt-6 h-80 min-w-0">
          <ResponsiveContainer width="100%" height={320}>
            <AreaChart data={weeklyTrend}>
              <defs>
                <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.2}/>
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" />
              <XAxis 
                dataKey="date" 
                stroke="#3e4a65" 
                tickLine={false} 
                axisLine={false} 
                style={{ fontSize: 10, fontWeight: 600 }}
              />
              <YAxis 
                stroke="#3e4a65" 
                tickLine={false} 
                axisLine={false} 
                allowDecimals={false}
                style={{ fontSize: 10, fontWeight: 600 }}
              />
              <Tooltip content={<CustomTooltip />} />
              <Area 
                type="monotone" 
                dataKey="count" 
                name="New Profiles" 
                stroke="#10b981" 
                strokeWidth={3} 
                fillOpacity={1} 
                fill="url(#colorCount)" 
                dot={{ r: 4, stroke: '#10b981', strokeWidth: 2, fill: '#080d1a' }} 
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
