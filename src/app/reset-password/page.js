
'use client';

import Link from 'next/link';

export default function ResetPasswordPage() {
  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ background: 'var(--bg-base)' }}
    >
      <div
        className="pointer-events-none fixed inset-0"
        style={{
          background:
            'radial-gradient(ellipse 70% 50% at 50% -5%, rgba(99,102,241,0.18), transparent)',
        }}
      />

      <div className="relative z-10 w-full max-w-md text-center">
        <div className="glass-card p-8 sm:p-10">

          <div className="mb-5">
            <h1
              className="text-7xl font-extrabold tracking-tight"
              style={{ color: '#818cf8' }}
            >
              404
            </h1>
          </div>

          <h2 className="text-2xl font-bold text-white">
            Page Not Found
          </h2>

          <p className="mt-3 text-sm" style={{ color: '#64748b' }}>
            Sorry, the page you are looking for doesn't exist
            or has been moved.
          </p>

          <Link
            href="/login"
            className="btn btn-primary inline-flex mt-8"
          >
            ← Back to Login
          </Link>

        </div>
      </div>
    </div>
  );
}
