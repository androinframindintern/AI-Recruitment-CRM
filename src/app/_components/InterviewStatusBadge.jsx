const STATUS_META = {
  scheduled: { label: 'Scheduled', cls: 'badge-violet' },
  rescheduled: { label: 'Rescheduled', cls: 'badge-indigo' },
  completed: { label: 'Completed', cls: 'badge-emerald' },
  cancelled: { label: 'Cancelled', cls: 'badge-rose' },
};

export default function InterviewStatusBadge({ status }) {
  const meta = STATUS_META[status] || { label: status || 'Unknown', cls: 'badge-slate' };
  return <span className={`badge ${meta.cls}`}>{meta.label}</span>;
}
