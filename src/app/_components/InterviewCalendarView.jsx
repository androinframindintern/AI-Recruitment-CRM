'use client';

import InterviewStatusBadge from './InterviewStatusBadge';
import SyncStatusBadge from './SyncStatusBadge';

function monthStart(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function buildDays(anchor) {
  const start = monthStart(anchor);
  const first = new Date(start);
  first.setDate(1 - start.getDay());
  return Array.from({ length: 42 }, (_, index) => {
    const day = new Date(first);
    day.setDate(first.getDate() + index);
    return day;
  });
}

export default function InterviewCalendarView({ interviews = [], anchorDate = new Date(), onEdit, onCancel }) {
  const days = buildDays(anchorDate);
  const today = new Date();

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[760px] rounded-2xl border border-white/5 bg-[#03050b]/40 p-3">
        <div className="grid grid-cols-7 gap-2 pb-2 text-center text-[10px] font-bold uppercase tracking-widest text-slate-500">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => <div key={day}>{day}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-2">
          {days.map((day) => {
            const dayInterviews = interviews.filter((interview) => sameDay(new Date(interview.start_at), day));
            const muted = day.getMonth() !== anchorDate.getMonth();
            return (
              <div
                key={day.toISOString()}
                className={`min-h-32 rounded-xl border p-2 ${muted ? 'border-white/5 bg-white/[0.01]' : 'border-white/10 bg-white/[0.025]'} ${sameDay(day, today) ? 'ring-1 ring-cyan-400/40' : ''}`}
              >
                <div className="flex items-center justify-between">
                  <span className={`text-xs font-bold ${muted ? 'text-slate-600' : 'text-white'}`}>{day.getDate()}</span>
                  {dayInterviews.length > 0 && <span className="badge badge-indigo">{dayInterviews.length}</span>}
                </div>
                <div className="mt-2 space-y-2">
                  {dayInterviews.slice(0, 3).map((interview) => (
                    <div key={interview.id} className="rounded-lg border border-white/5 bg-[#080d1a] p-2 text-left">
                      <p className="truncate text-[11px] font-bold text-white">{interview.title}</p>
                      <p className="mt-0.5 text-[10px] text-slate-400">
                        {new Date(interview.start_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        {interview.candidate?.full_name ? ` · ${interview.candidate.full_name}` : ''}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1">
                        <InterviewStatusBadge status={interview.status} />
                        <SyncStatusBadge status={interview.sync_status} />
                      </div>
                      <div className="mt-2 flex gap-1">
                        <button type="button" className="btn btn-ghost btn-xs" onClick={() => onEdit?.(interview)}>Edit</button>
                        {interview.status !== 'cancelled' && <button type="button" className="btn btn-ghost btn-xs" onClick={() => onCancel?.(interview)}>Cancel</button>}
                      </div>
                    </div>
                  ))}
                  {dayInterviews.length > 3 && <p className="text-[10px] text-slate-500">+{dayInterviews.length - 3} more</p>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
