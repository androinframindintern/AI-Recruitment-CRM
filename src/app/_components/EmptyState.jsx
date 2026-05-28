export default function EmptyState({ title, detail, action }) {
  return (
    <div className="rounded-3xl border border-dashed border-white/15 bg-white/[0.03] p-8 text-center">
      <h3 className="text-xl font-semibold text-white">{title}</h3>
      <p className="mt-2 text-sm text-slate-400">{detail}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
