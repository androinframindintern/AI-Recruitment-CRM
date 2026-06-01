import AppShell from '../_components/AppShell';
import SectionCard from '../_components/SectionCard';

const envRows = [
  ['Supabase', 'NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY'],
  ['Gemini', 'GEMINI_API_KEY'],
  ['Resume parsing', 'TIKA_SERVER_URL (optional, local fallback is built in)'],
  ['Email', 'RESEND_API_KEY, RESEND_FROM_EMAIL'],
  ['Google Calendar', 'GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN, GOOGLE_CALENDAR_ID'],
];

export default function SettingsPage() {
  return (
    <AppShell>
      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <SectionCard title="Integration checklist" description="Use this page as the setup handoff for real APIs and deployment.">
          <div className="overflow-hidden rounded-3xl border border-white/10">
            <table className="min-w-full divide-y divide-white/10 text-left text-sm">
              <thead className="bg-white/[0.03] text-slate-300">
                <tr>
                  <th className="px-4 py-3 font-medium" />
                  <th className="px-4 py-3 font-medium">Service</th>
                  <th className="px-4 py-3 font-medium">Environment values</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10 text-slate-400">
                {envRows.map(([service, values]) => (
                  <tr key={service}>
                    <td className="px-4 py-3 font-medium text-white">{service}</td>
                    <td className="px-4 py-3">{values}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>

        <SectionCard title="Demo mode behavior" description="The app stays functional before you connect external accounts.">
          <div className="space-y-4 text-sm leading-7 text-slate-300">
            <p><strong className="text-white">Auth:</strong> falls back to a built-in demo recruiter so the dashboard opens instantly.</p>
            <p><strong className="text-white">Gemini:</strong> returns deterministic placeholder parsing and scoring until the API key is added.</p>
            <p><strong className="text-white">Resend:</strong> email actions are logged as demo sends instead of leaving the app.</p>
            <p><strong className="text-white">Calendar:</strong> interview scheduling returns a demo event until Google credentials are configured.</p>
            <p><strong className="text-white">Supabase:</strong> the backend stores records in memory until your database is connected.</p>
          </div>
        </SectionCard>
      </div>
    </AppShell>
  );
}
