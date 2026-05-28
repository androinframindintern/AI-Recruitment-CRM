'use client';
import { BarChart, Bar, CartesianGrid, LineChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

export default function AnalyticsCharts({ funnel, scoreDistribution, weeklyTrend }) {
  return (
    <>
      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <section className="rounded-[28px] border border-white/10 bg-slate-900/60 p-5 shadow-2xl shadow-slate-950/20">
          <div>
            <h3 className="text-lg font-semibold text-white">Hiring funnel</h3>
            <p className="mt-1 text-sm text-slate-400">Stage-by-stage candidate distribution across the pipeline.</p>
          </div>
          <div className="mt-5 h-80 min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={funnel}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.15)" />
                <XAxis dataKey="stage" stroke="#94a3b8" tickLine={false} axisLine={false} />
                <YAxis stroke="#94a3b8" tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="count" fill="#22d3ee" radius={[10, 10, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="rounded-[28px] border border-white/10 bg-slate-900/60 p-5 shadow-2xl shadow-slate-950/20">
          <div>
            <h3 className="text-lg font-semibold text-white">AI score distribution</h3>
            <p className="mt-1 text-sm text-slate-400">Shows how candidate match quality is spread across the current pool.</p>
          </div>
          <div className="mt-5 h-80 min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={scoreDistribution}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.15)" />
                <XAxis dataKey="label" stroke="#94a3b8" tickLine={false} axisLine={false} />
                <YAxis stroke="#94a3b8" tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="count" fill="#818cf8" radius={[10, 10, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>

      <div className="mt-6 rounded-[28px] border border-white/10 bg-slate-900/60 p-5 shadow-2xl shadow-slate-950/20">
        <div>
          <h3 className="text-lg font-semibold text-white">Weekly hiring trend</h3>
          <p className="mt-1 text-sm text-slate-400">Daily candidate intake trend based on created profiles.</p>
        </div>
        <div className="mt-5 h-80 min-w-0">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={weeklyTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.15)" />
              <XAxis dataKey="date" stroke="#94a3b8" tickLine={false} axisLine={false} />
              <YAxis stroke="#94a3b8" tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip />
              <Line type="monotone" dataKey="count" stroke="#34d399" strokeWidth={3} dot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </>
  );
}
