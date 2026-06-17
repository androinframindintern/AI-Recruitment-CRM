export default function EmptyState({ title, detail, action, icon }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '56px 24px',
        textAlign: 'center',
        borderRadius: 'var(--radius-xl)',
        border: '1px dashed rgba(255,255,255,0.09)',
        background: 'rgba(255,255,255,0.016)',
      }}
    >
      {/* Icon shell */}
      <div
        style={{
          width: 60, height: 60, borderRadius: 18, marginBottom: 20,
          background: 'linear-gradient(135deg, rgba(99,102,241,0.12), rgba(6,182,212,0.08))',
          border: '1px solid rgba(99,102,241,0.20)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 8px 24px rgba(99,102,241,0.10)',
        }}
      >
        {icon || (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#818cf8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        )}
      </div>

      <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
        {title}
      </p>

      {detail && (
        <p style={{ marginTop: 8, fontSize: 13, color: 'var(--text-secondary)', maxWidth: 300, lineHeight: 1.55 }}>
          {detail}
        </p>
      )}

      {action && (
        <div style={{ marginTop: 22 }}>
          {action}
        </div>
      )}
    </div>
  );
}
