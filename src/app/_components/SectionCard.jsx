export default function SectionCard({ title, description, actions, children, className = '', noPad = false }) {
  return (
    <div className={`glass-card ${noPad ? '' : 'p-6'} ${className}`}>
      {(title || description || actions) && (
        <div
          className={`flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between ${noPad ? 'px-6 pt-6' : ''}`}
          style={{ marginBottom: children ? (noPad ? 0 : 20) : 0 }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            {title && (
              <h2
                style={{
                  fontSize: 15,
                  fontWeight: 700,
                  color: 'var(--text-primary)',
                  letterSpacing: '-0.02em',
                }}
              >
                {title}
              </h2>
            )}
            {description && (
              <p
                style={{
                  marginTop: 4,
                  fontSize: 13,
                  color: 'var(--text-secondary)',
                  lineHeight: 1.55,
                }}
              >
                {description}
              </p>
            )}
          </div>
          {actions && (
            <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
              {actions}
            </div>
          )}
        </div>
      )}

      {children && (
        <div className={noPad && (title || description || actions) ? 'px-6 pb-6 pt-5' : ''}>
          {children}
        </div>
      )}
    </div>
  );
}
