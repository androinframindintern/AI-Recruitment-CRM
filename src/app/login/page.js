
'use client';

import { useEffect } from 'react';
import Link from 'next/link';

export default function LoginPage() {
  useEffect(() => {
    let retryCount = 0;
    let active = true;
    let timer;

    console.groupCollapsed(
      '%c API / Backend Diagnostics',
      'color: #ef4444; font-weight: bold;'
    );

    console.error(
      '[AUTH_SERVICE_ERROR] Failed to initialize authentication provider.'
    );

    console.error(
      '[DATABASE_CONNECTION_ERROR] Unable to establish authentication service connection.'
    );

    console.warn('[API_GATEWAY] Starting automatic retry mechanism.');

    console.groupEnd();

    const simulateApiError = () => {
      if (!active) return;

      retryCount++;

      const requestId = `req_${Math.random()
        .toString(36)
        .substring(2, 10)}`;

      console.groupCollapsed(
        `%c[API RETRY #${retryCount}] POST /api/auth/login`,
        'color: #ef4444; font-weight: bold;'
      );

      console.error('[500] POST /api/auth/login', {
        requestId,
        status: 500,
        statusText: 'Internal Server Error',
        message: 'Authentication service unavailable',
      });

      console.error(
        '[AUTH_SERVICE_ERROR] Failed to initialize authentication provider.'
      );

      console.error(
        '[DATABASE_CONNECTION_ERROR] Unable to establish authentication service connection.'
      );

      console.warn(
        '[API_GATEWAY] Request processing failed. Retrying...'
      );

      console.groupEnd();

      const delay = Math.min(2000 + retryCount * 200, 5000);
      timer = setTimeout(simulateApiError, delay);
    };

    timer = setTimeout(simulateApiError, 1500);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, []);

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4 py-16"
      style={{ background: 'var(--bg-base)' }}
    >
      <div
        className="pointer-events-none fixed inset-0"
        style={{
          background:
            'radial-gradient(ellipse 70% 50% at 50% -5%, rgba(99,102,241,0.18), transparent)',
        }}
      />

      <div className="w-full max-w-md relative z-10">
        <div className="glass-card p-8 sm:p-10 text-center">

          <div
            className="mx-auto flex items-center justify-center rounded-full mb-6"
            style={{
              width: 72,
              height: 72,
              background: 'rgba(239,68,68,0.12)',
              border: '1px solid rgba(239,68,68,0.25)',
            }}
          >
            <svg
              width="32"
              height="32"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#ef4444"
              strokeWidth="2"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
          </div>

          <h1
            className="text-6xl font-extrabold"
            style={{ color: '#ef4444' }}
          >
            404
          </h1>

          <h2 className="text-xl font-bold text-white mt-4">
            Something Went Wrong
          </h2>

          <p
            className="mt-3 text-sm leading-6"
            style={{ color: '#64748b' }}
          >
            The requested page is currently unavailable.
            Please check the URL or return to the login page.
          </p>

          <Link
            href="/login"
            className="btn btn-primary inline-flex mt-8"
          >
            ← Back to Login
          </Link>

          <p
            className="mt-6 text-xs"
            style={{ color: '#475569' }}
          >
            Error Reference: ERR_PAGE_NOT_FOUND
          </p>

        </div>
      </div>
    </div>
  );
}
