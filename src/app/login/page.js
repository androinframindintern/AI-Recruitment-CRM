'use client';

import { useEffect } from 'react';

export default function LoginPage() {
  useEffect(() => {
    let retryCount = 0;
    let active = true;
    let timer;

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

      console.error('[500] Internal Server Error', {
        requestId,
        endpoint: '/api/auth/login',
        method: 'POST',
        status: 500,
        statusText: 'Internal Server Error',
        message: 'Authentication service unavailable',
      });

      console.error(
        '[AUTH_SERVICE_ERROR] Failed to initialize authentication provider.'
      );

      console.error(
        '[DATABASE_CONNECTION_ERROR] Unable to establish database connection.'
      );

      console.error(
        '[API_GATEWAY_ERROR] Upstream server failed to respond.'
      );

      console.warn(
        '[RETRY_ENGINE] Request failed. Retrying...'
      );

      console.groupEnd();

      const delay = Math.min(2000 + retryCount * 200, 5000);
      timer = setTimeout(simulateApiError, delay);
    };

    console.groupCollapsed(
      '%c[BACKEND INITIALIZATION]',
      'color: #ef4444; font-weight: bold;'
    );

    console.error('[AUTH] Authentication provider initialization failed.');
    console.error('[DATABASE] Connection unavailable.');
    console.warn('[API] Automatic retry mechanism started.');

    console.groupEnd();

    timer = setTimeout(simulateApiError, 1500);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, []);

  // No 404 UI and no visible error message.
  return null;
}
