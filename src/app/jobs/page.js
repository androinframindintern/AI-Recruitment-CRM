'use client';

import Link from 'next/link';
import AppShell from '../_components/AppShell';

export default function JobsPage() {
  return (
    <AppShell>
      <div className="mb-8 animate-fade-in">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
              Job Management
            </h1>

            <p className="mt-2 text-sm text-[#8b95b0]">
              Create drafts, publish public career roles, close openings, and rank applicants through the existing ATS matching flow.
            </p>
          </div>

          <Link
            href="/careers"
            className="btn btn-secondary btn-sm self-start lg:self-auto"
          >
            View public careers site
          </Link>

        </div>
      </div>
    </AppShell>
  );
}
