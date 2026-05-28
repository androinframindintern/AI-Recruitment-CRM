export function PrimaryButton({ className = '', ...props }) {
  return (
    <button
      {...props}
      className={`rounded-2xl bg-white px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
    />
  );
}

export function SecondaryButton({ className = '', ...props }) {
  return (
    <button
      {...props}
      className={`rounded-2xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
    />
  );
}
