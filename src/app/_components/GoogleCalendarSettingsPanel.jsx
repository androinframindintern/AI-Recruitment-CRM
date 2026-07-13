'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import ConfirmationModal from './ConfirmationModal';
import SectionCard from './SectionCard';
import SyncStatusBadge from './SyncStatusBadge';
import { DangerButton, PrimaryButton, SecondaryButton } from './PrimaryButton';
import {
  disconnectGoogleCalendar,
  getGoogleCalendarStatus,
  listGoogleCalendars,
  startGoogleCalendarConnect,
  syncGoogleCalendar,
  updateGoogleCalendarSettings,
} from '@/lib/interviewData';

export default function GoogleCalendarSettingsPanel() {
  const queryClient = useQueryClient();
  const [disconnectOpen, setDisconnectOpen] = useState(false);
  const [selectedCalendarId, setSelectedCalendarId] = useState('');
  const [notice, setNotice] = useState('');
  const [callbackState, setCallbackState] = useState({ status: '', message: '' });

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const params = new URLSearchParams(window.location.search);
      setCallbackState({
        status: params.get('googleCalendar') || '',
        message: params.get('message') || '',
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const statusQuery = useQuery({
    queryKey: ['google-calendar-status'],
    queryFn: getGoogleCalendarStatus,
  });

  const connection = statusQuery.data?.connection;
  const configured = Boolean(statusQuery.data?.configured);
  const connected = Boolean(connection?.connected);

  const calendarsQuery = useQuery({
    enabled: connected,
    queryKey: ['google-calendars'],
    queryFn: listGoogleCalendars,
  });

  const connect = useMutation({
    mutationFn: () => startGoogleCalendarConnect('/settings'),
    onError: (error) => setNotice(error.message || 'Could not start Google Calendar connection.'),
  });

  const disconnect = useMutation({
    mutationFn: disconnectGoogleCalendar,
    onSuccess: () => {
      setDisconnectOpen(false);
      setNotice('Google Calendar disconnected.');
      queryClient.invalidateQueries({ queryKey: ['google-calendar-status'] });
      queryClient.invalidateQueries({ queryKey: ['google-calendars'] });
    },
    onError: (error) => setNotice(error.message || 'Could not disconnect Google Calendar.'),
  });

  const saveCalendar = useMutation({
    mutationFn: () => updateGoogleCalendarSettings({ calendarId: selectedCalendarId || connection?.calendarId || 'primary' }),
    onSuccess: () => {
      setNotice('Calendar settings saved.');
      queryClient.invalidateQueries({ queryKey: ['google-calendar-status'] });
    },
    onError: (error) => setNotice(error.message || 'Could not update Google Calendar settings.'),
  });

  const sync = useMutation({
    mutationFn: () => syncGoogleCalendar({ createMeetLink: true }),
    onSuccess: (result) => {
      setNotice(`Calendar sync complete. ${result.synced || 0} synced, ${result.failed || 0} failed.`);
      queryClient.invalidateQueries({ queryKey: ['google-calendar-status'] });
      queryClient.invalidateQueries({ queryKey: ['interviews'] });
    },
    onError: (error) => setNotice(error.message || 'Google Calendar sync failed.'),
  });

  const callbackStatus = callbackState.status;
  const callbackMessage = callbackState.message;
  const calendars = calendarsQuery.data?.calendars || [];

  return (
    <>
      <SectionCard
        title="Google Calendar Settings"
        description="Connect a recruiter Google account and keep CRM interviews synchronized with calendar events."
      >
        <div className="space-y-5">
          {callbackStatus === 'connected' && (
            <div className="alert alert-success text-xs">Google Calendar connected successfully.</div>
          )}
          {callbackStatus === 'error' && (
            <div className="alert alert-error text-xs">{callbackMessage || 'Google Calendar connection failed.'}</div>
          )}
          {notice && <div className="alert alert-info text-xs">{notice}</div>}
          {!configured && (
            <div className="alert alert-warning text-xs">
              Google Calendar OAuth is not fully configured. Add the server environment variables before connecting a live account.
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <Info label="Connection Status" value={connected ? 'Connected' : 'Not connected'} />
            <Info label="Connected Account" value={connection?.accountEmail || '—'} />
            <Info label="Selected Calendar" value={connection?.calendarSummary || connection?.calendarId || '—'} />
            <Info label="Last Sync" value={connection?.lastSyncAt ? new Date(connection.lastSyncAt).toLocaleString() : '—'} />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Sync Status</span>
            <SyncStatusBadge status={connection?.syncStatus === 'connected' ? 'synced' : connection?.syncStatus || 'not_connected'} />
          </div>

          {connection?.syncError && (
            <div className="rounded-xl border border-rose-500/25 bg-rose-500/10 px-4 py-3 text-xs text-rose-100">
              {connection.syncError}
            </div>
          )}

          {connected && calendars.length > 0 && (
            <div>
              <label className="form-label mb-1.5 block">Calendar</label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <select
                  className="form-select flex-1"
                  value={selectedCalendarId || connection?.calendarId || 'primary'}
                  onChange={(event) => setSelectedCalendarId(event.target.value)}
                >
                  {calendars.map((calendar) => (
                    <option key={calendar.id} value={calendar.id} className="bg-slate-900">
                      {calendar.summary}{calendar.primary ? ' (Primary)' : ''}
                    </option>
                  ))}
                </select>
                <SecondaryButton type="button" disabled={saveCalendar.isPending} onClick={() => saveCalendar.mutate()}>
                  {saveCalendar.isPending ? 'Saving…' : 'Save Calendar'}
                </SecondaryButton>
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3 border-t border-white/5 pt-5">
            {!connected ? (
              <PrimaryButton type="button" disabled={!configured || connect.isPending} onClick={() => connect.mutate()}>
                {connect.isPending ? 'Opening Google…' : 'Connect Google Account'}
              </PrimaryButton>
            ) : (
              <>
                <PrimaryButton type="button" disabled={sync.isPending} onClick={() => sync.mutate()}>
                  {sync.isPending ? 'Syncing…' : 'Manual Sync'}
                </PrimaryButton>
                <DangerButton type="button" disabled={disconnect.isPending} onClick={() => setDisconnectOpen(true)}>
                  Disconnect
                </DangerButton>
              </>
            )}
          </div>
        </div>
      </SectionCard>

      <ConfirmationModal
        isOpen={disconnectOpen}
        onClose={() => setDisconnectOpen(false)}
        onConfirm={() => disconnect.mutate()}
        title="Disconnect Google Calendar"
        message="This removes the encrypted Google refresh token from the CRM. Existing interviews remain in the CRM, but future calendar sync will stop until you reconnect."
        confirmText="Disconnect"
        isPending={disconnect.isPending}
      />
    </>
  );
}

function Info({ label, value }) {
  return (
    <div className="rounded-xl border border-white/5 bg-white/[0.012] p-4">
      <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-500">{label}</p>
      <p className="mt-1.5 break-words text-sm font-semibold text-white">{value}</p>
    </div>
  );
}
