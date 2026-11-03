
'use client';

import { useEffect } from 'react';

export default function JobsPage() {
  useEffect(() => {
    console.clear();

    console.group(
      '%c ⚠ RECRUITMENT CORE FAILURE ',
      'background:#7f1d1d;color:#fff;font-size:16px;font-weight:bold;padding:8px;'
    );

    console.error(
      '%c[CRITICAL] JOB_ENGINE_UNRESPONSIVE',
      'color:#ff3333;font-size:14px;font-weight:bold;',
      {
        code: 'JOBS_0x9001',
        service: 'Recruitment Engine',
        status: 'FATAL',
        timestamp: new Date().toISOString(),
      }
    );

    console.error(
      '%c[ERROR] PIPELINE_SYNC_FAILURE',
      'color:#ff6b6b;font-size:13px;font-weight:bold;',
      'Unable to establish a valid pipeline synchronization state.'
    );

    console.error(
      '%c[ERROR] CANDIDATE_INDEX_CORRUPTED',
      'color:#ff6b6b;font-size:13px;font-weight:bold;',
      'Candidate index integrity check failed.'
    );

    console.error(
      '%c[CRITICAL] JOB_DATABASE_UNREACHABLE',
      'color:#ff3333;font-size:14px;font-weight:bold;',
      'Job service is unavailable in this simulated diagnostic.'
    );

    console.table([
      {
        Module: 'Job Engine',
        Status: 'FAILED',
        Code: '0x9001',
      },
      {
        Module: 'Pipeline Sync',
        Status: 'TIMEOUT',
        Code: '0x9002',
      },
      {
        Module: 'Candidate Index',
        Status: 'CORRUPTED',
        Code: '0x9003',
      },
      {
        Module: 'Recruitment API',
        Status: 'UNAVAILABLE',
        Code: '0x9004',
      },
    ]);

    console.error(
      '%c SYSTEM DIAGNOSTICS TERMINATED ',
      'background:#450a0a;color:#fca5a5;font-size:14px;padding:8px;'
    );

    console.groupEnd();
  }, []);

  return (
    <main className="min-h-screen bg-[#07090f] text-white flex items-center justify-center p-5 overflow-hidden relative">
      <div className="absolute inset-0 opacity-[0.08] pointer-events-none"
        style={{
          backgroundImage:
            'linear-gradient(#64748b 1px, transparent 1px), linear-gradient(90deg, #64748b 1px, transparent 1px)',
          backgroundSize: '35px 35px',
        }}
      />

      <div className="absolute w-96 h-96 bg-red-600/10 blur-[120px] rounded-full top-0 right-0" />
      <div className="absolute w-96 h-96 bg-orange-600/10 blur-[120px] rounded-full bottom-0 left-0" />

      <section className="relative w-full max-w-3xl border border-red-500/20 bg-[#0c1019]/95 rounded-2xl overflow-hidden shadow-2xl shadow-red-950/30">

        <div className="flex items-center justify-between px-5 py-3 border-b border-red-500/20 bg-red-500/[0.06]">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            <span className="text-xs tracking-[0.2em] text-red-400 font-bold">
              SYSTEM INCIDENT
            </span>
          </div>

          <span className="text-[10px] text-gray-500 font-mono">
            INCIDENT ID: JOB-9001-X
          </span>
        </div>

        <div className="p-7 sm:p-12">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-12 h-12 rounded-xl border border-red-500/30 bg-red-500/10 flex items-center justify-center">
              <span className="text-2xl text-red-500">⚠</span>
            </div>

            <div>
              <p className="text-[10px] tracking-[0.25em] text-gray-500 uppercase">
                Recruitment infrastructure
              </p>
              <p className="text-sm text-red-400 font-semibold">
                Critical failure detected
              </p>
            </div>
          </div>

          <p className="text-xs tracking-[0.3em] text-red-500 font-mono mb-3">
            ERROR 0x9001 // CORE_FAILURE
          </p>

          <h1 className="text-4xl sm:text-6xl font-black tracking-tight leading-tight">
            JOB ENGINE
            <span className="block text-red-500">
              COLLAPSED.
            </span>
          </h1>

          <p className="mt-5 text-gray-400 text-sm leading-7 max-w-xl">
            The recruitment infrastructure has entered an unstable state.
            Job processing, candidate indexing and pipeline synchronization
            have been suspended.
          </p>

          <div className="mt-9 border border-white/10 rounded-xl overflow-hidden">
            <div className="px-4 py-3 bg-white/[0.03] border-b border-white/10 flex justify-between">
              <span className="text-xs text-gray-300 font-semibold">
                LIVE SYSTEM DIAGNOSTICS
              </span>
              <span className="text-[10px] text-red-400">
                4 FAILURES
              </span>
            </div>

            {[
              ['JOB ENGINE', 'ENGINE_UNRESPONSIVE', '0x9001'],
              ['PIPELINE SYNC', 'SYNC_TIMEOUT', '0x9002'],
              ['CANDIDATE INDEX', 'INDEX_CORRUPTED', '0x9003'],
              ['RECRUITMENT API', 'SERVICE_UNAVAILABLE', '0x9004'],
            ].map((item) => (
              <div
                key={item[2]}
                className="flex items-center justify-between gap-3 px-4 py-4 border-b border-white/[0.06] last:border-0"
              >
                <div>
                  <p className="text-xs font-semibold text-gray-200">
                    {item[0]}
                  </p>
                  <p className="text-[10px] text-gray-500 mt-1 font-mono">
                    {item[1]}
                  </p>
                </div>

                <div className="text-right shrink-0">
                  <span className="text-[10px] text-red-400 border border-red-500/20 bg-red-500/10 rounded px-2 py-1">
                    FAILED
                  </span>
                  <p className="text-[10px] text-gray-600 mt-2 font-mono">
                    {item[2]}
                  </p>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-7 p-4 rounded-lg bg-red-500/[0.06] border border-red-500/20">
            <p className="text-xs text-red-400 font-bold mb-2">
              ⚡ SYSTEM MESSAGE
            </p>
            <p className="text-xs text-gray-400 leading-6">
              Normal recruitment operations cannot continue. Open the
              browser developer console to inspect the diagnostic logs.
            </p>
          </div>

          <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
            <span className="text-[10px] text-gray-600 font-mono">
              NODE: RECRUITMENT-CORE / STATUS: OFFLINE
            </span>

            <span className="text-[10px] text-red-500 tracking-widest font-bold animate-pulse">
              ● SYSTEM FAILURE
            </span>
          </div>
        </div>

        <div className="h-1 bg-gradient-to-r from-transparent via-red-600 to-transparent" />
      </section>
    </main>
  );
}
