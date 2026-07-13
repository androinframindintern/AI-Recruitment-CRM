const SYNC_META = {
  synced: { label: 'Synced', cls: 'badge-emerald' },
  pending: { label: 'Pending', cls: 'badge-amber' },
  failed: { label: 'Failed', cls: 'badge-rose' },
  not_connected: { label: 'Not connected', cls: 'badge-slate' },
  deleted: { label: 'Deleted', cls: 'badge-slate' },
  demo: { label: 'Demo', cls: 'badge-cyan' },
};

export default function SyncStatusBadge({ status }) {
  const meta = SYNC_META[status] || { label: status || 'Unknown', cls: 'badge-slate' };
  return <span className={`badge ${meta.cls}`}>{meta.label}</span>;
}
