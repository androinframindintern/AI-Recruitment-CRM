export default function StatCard({ label, value, hint, trend, icon, accent = '#6366f1' }) {
  const isPositiveTrend = trend && !String(trend).startsWith('-');

  return (
    <div className="stat-card" style={{ '--accent': accent }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p
            style={{
              fontSize: 10,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.10em',
              color: 'var(--text-muted)',
            }}
          >
            {label}
          </p>

          <p
            style={{
              marginTop: 12,
              fontSize: 30,
              fontWeight: 800,
              color: 'var(--text-primary)',
              letterSpacing: '-0.04em',
              lineHeight: 1,
            }}
          >
            {value ?? '—'}
          </p>

          {hint && (
            <p style={{ marginTop: 8, fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.4 }}>
              {hint}
            </p>
          )}

          {trend && (
            <p
              style={{
                marginTop: 8,
                fontSize: 12,
                fontWeight: 600,
                color: isPositiveTrend ? '#10b981' : '#f43f5e',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              {isPositiveTrend ? (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="18 15 12 9 6 15" />
                </svg>
              ) : (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              )}
              {trend}
            </p>
          )}
        </div>

        {icon && (
          <div
            style={{
              width: 44, height: 44, borderRadius: 12, flexShrink: 0,
              background: `rgba(${hexToRgb(accent)}, 0.12)`,
              border: `1px solid rgba(${hexToRgb(accent)}, 0.22)`,
              color: accent,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: `0 4px 16px rgba(${hexToRgb(accent)}, 0.10)`,
            }}
          >
            {icon}
          </div>
        )}
      </div>
    </div>
  );
}

function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return '99,102,241';
  return `${parseInt(result[1],16)},${parseInt(result[2],16)},${parseInt(result[3],16)}`;
}
