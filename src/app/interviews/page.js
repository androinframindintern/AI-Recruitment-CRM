'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import AppShell from '../_components/AppShell';
import ConfirmationModal from '../_components/ConfirmationModal';
import EmptyState from '../_components/EmptyState';
import InterviewCalendarView from '../_components/InterviewCalendarView';
import InterviewFormModal from '../_components/InterviewFormModal';
import InterviewStatusBadge from '../_components/InterviewStatusBadge';
import SectionCard from '../_components/SectionCard';
import SyncStatusBadge from '../_components/SyncStatusBadge';
import { DangerButton, GhostButton, PrimaryButton, SecondaryButton } from '../_components/PrimaryButton';
import { listCandidates, listJobs } from '@/lib/recruitmentData';
import { cancelInterview, deleteInterview, listInterviews, scheduleInterview, syncGoogleCalendar, syncInterview, updateInterview } from '@/lib/interviewData';

const PAGE_SIZE = 10;

function defaultFilters() {
  return {
    q: '',
    status: '',
    syncStatus: '',
    from: '',
    to: '',
    sortBy: 'start_at',
    sortDir: 'asc',
    view: 'upcoming',
    page: 1,
    pageSize: PAGE_SIZE,
  };
}

function formatDateTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return date.toLocaleString();
}

export default function InterviewsPage() {
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState(defaultFilters);
  const [viewMode, setViewMode] = useState('table');
  const [modalState, setModalState] = useState({ open: false, interview: null });
  const [cancelTarget, setCancelTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [notice, setNotice] = useState('');
  const [calendarAnchor, setCalendarAnchor] = useState(new Date());

  const queryParams = useMemo(() => filters, [filters]);
  const interviewsQuery = useQuery({
    queryKey: ['interviews', queryParams],
    queryFn: () => listInterviews(queryParams),
  });

  const candidatesQuery = useQuery({ queryKey: ['candidates'], queryFn: listCandidates });
  const jobsQuery = useQuery({ queryKey: ['jobs'], queryFn: listJobs });

  const candidates = useMemo(() => candidatesQuery.data?.candidates || [], [candidatesQuery.data?.candidates]);
  const jobs = useMemo(() => jobsQuery.data?.jobs || [], [jobsQuery.data?.jobs]);
  const interviews = useMemo(() => interviewsQuery.data?.interviews || [], [interviewsQuery.data?.interviews]);

  function updateFilter(field, value) {
    setFilters((current) => ({ ...current, [field]: value, page: field === 'page' ? value : 1 }));
  }

  function invalidateInterviews() {
    queryClient.invalidateQueries({ queryKey: ['interviews'] });
    queryClient.invalidateQueries({ queryKey: ['candidates'] });
    queryClient.invalidateQueries({ queryKey: ['analytics-page'] });
    queryClient.invalidateQueries({ queryKey: ['analytics-summary'] });
  }

  const saveInterview = useMutation({
    mutationFn: (payload) => modalState.interview
      ? updateInterview(modalState.interview.id, payload)
      : scheduleInterview(payload),
    onSuccess: () => {
      setNotice(modalState.interview ? 'Interview updated.' : 'Interview scheduled.');
      setModalState({ open: false, interview: null });
      invalidateInterviews();
    },
    onError: (error) => setNotice(error.message || 'Could not save interview.'),
  });

  const cancelMutation = useMutation({
    mutationFn: () => cancelInterview(cancelTarget.id, { reason: 'Cancelled by recruiter', sendUpdates: true }),
    onSuccess: () => {
      setNotice('Interview cancelled.');
      setCancelTarget(null);
      invalidateInterviews();
    },
    onError: (error) => setNotice(error.message || 'Could not cancel interview.'),
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteInterview(deleteTarget.id, { sendUpdates: true }),
    onSuccess: () => {
      setNotice('Interview deleted.');
      setDeleteTarget(null);
      invalidateInterviews();
    },
    onError: (error) => setNotice(error.message || 'Could not delete interview.'),
  });

  const syncSingle = useMutation({
    mutationFn: (interview) => syncInterview(interview.id, { createMeetLink: true, sendUpdates: false }),
    onSuccess: () => {
      setNotice('Interview synced.');
      invalidateInterviews();
    },
    onError: (error) => setNotice(error.message || 'Could not sync interview.'),
  });

  const syncAll = useMutation({
    mutationFn: () => syncGoogleCalendar({ createMeetLink: true, sendUpdates: false }),
    onSuccess: (result) => {
      setNotice(`Calendar sync complete. ${result.synced || 0} synced, ${result.failed || 0} failed.`);
      invalidateInterviews();
      queryClient.invalidateQueries({ queryKey: ['google-calendar-status'] });
    },
    onError: (error) => setNotice(error.message || 'Google Calendar sync failed.'),
  });

  const stats = useMemo(() => {
    const todayKey = new Date().toDateString();
    return {
      listed: interviews.length,
      today: interviews.filter((interview) => new Date(interview.start_at).toDateString() === todayKey).length,
      failed: interviews.filter((interview) => interview.sync_status === 'failed').length,
      history: interviews.filter((interview) => ['cancelled', 'completed'].includes(interview.status) || new Date(interview.start_at) < new Date()).length,
    };
  }, [interviews]);

  return (
    <AppShell>
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between animate-fade-in">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">Interview Scheduling</h1>
          <p className="mt-2 text-sm text-[#8b95b0]">Schedule, sync, and manage candidate interviews across your recruiter workspace.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <SecondaryButton type="button" disabled={syncAll.isPending} onClick={() => syncAll.mutate()}>
            {syncAll.isPending ? 'Syncing…' : 'Sync Calendar'}
          </SecondaryButton>
          <PrimaryButton type="button" onClick={() => setModalState({ open: true, interview: null })}>Schedule Interview</PrimaryButton>
        </div>
      </div>

      {notice && <div className="alert alert-info mb-6 text-xs">{notice}</div>}

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Visible Interviews" value={stats.listed} tone="indigo" />
        <Metric label="Today" value={stats.today} tone="cyan" />
        <Metric label="Sync Failed" value={stats.failed} tone="rose" />
        <Metric label="History Items" value={stats.history} tone="emerald" />
      </div>

      <SectionCard title="Interview Dashboard" description="Search, filter, sort, and act on scheduled interviews." noPad>
        <div className="space-y-5">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
            <input
              className="form-input xl:col-span-2"
              placeholder="Search interviews, candidates, emails..."
              value={filters.q}
              onChange={(event) => updateFilter('q', event.target.value)}
            />
            <select className="form-select" value={filters.status} onChange={(event) => updateFilter('status', event.target.value)}>
              <option value="" className="bg-slate-900">All statuses</option>
              <option value="scheduled" className="bg-slate-900">Scheduled</option>
              <option value="rescheduled" className="bg-slate-900">Rescheduled</option>
              <option value="completed" className="bg-slate-900">Completed</option>
              <option value="cancelled" className="bg-slate-900">Cancelled</option>
            </select>
            <select className="form-select" value={filters.syncStatus} onChange={(event) => updateFilter('syncStatus', event.target.value)}>
              <option value="" className="bg-slate-900">All sync states</option>
              <option value="synced" className="bg-slate-900">Synced</option>
              <option value="pending" className="bg-slate-900">Pending</option>
              <option value="failed" className="bg-slate-900">Failed</option>
              <option value="not_connected" className="bg-slate-900">Not connected</option>
              <option value="demo" className="bg-slate-900">Demo</option>
            </select>
            <input type="date" className="form-input" value={filters.from} onChange={(event) => updateFilter('from', event.target.value)} />
            <input type="date" className="form-input" value={filters.to} onChange={(event) => updateFilter('to', event.target.value)} />
          </div>

          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap gap-2">
              {['upcoming', 'history', 'all'].map((view) => (
                <button
                  key={view}
                  type="button"
                  className={`btn ${filters.view === view ? 'btn-primary' : 'btn-secondary'} btn-sm capitalize`}
                  onClick={() => updateFilter('view', view)}
                >
                  {view}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <select className="form-select" value={`${filters.sortBy}:${filters.sortDir}`} onChange={(event) => {
                const [sortBy, sortDir] = event.target.value.split(':');
                setFilters((current) => ({ ...current, sortBy, sortDir, page: 1 }));
              }}>
                <option value="start_at:asc" className="bg-slate-900">Soonest first</option>
                <option value="start_at:desc" className="bg-slate-900">Latest first</option>
                <option value="created_at:desc" className="bg-slate-900">Newest created</option>
                <option value="title:asc" className="bg-slate-900">Title A-Z</option>
              </select>
              <button type="button" className={`btn ${viewMode === 'table' ? 'btn-primary' : 'btn-secondary'} btn-sm`} onClick={() => setViewMode('table')}>Table</button>
              <button type="button" className={`btn ${viewMode === 'calendar' ? 'btn-primary' : 'btn-secondary'} btn-sm`} onClick={() => setViewMode('calendar')}>Calendar</button>
            </div>
          </div>

          {interviewsQuery.isLoading ? (
            <div className="py-16 text-center text-sm text-slate-500">Loading interviews…</div>
          ) : interviews.length ? (
            viewMode === 'calendar' ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-bold text-white">{calendarAnchor.toLocaleString('default', { month: 'long', year: 'numeric' })}</p>
                  <div className="flex gap-2">
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => setCalendarAnchor(new Date(calendarAnchor.getFullYear(), calendarAnchor.getMonth() - 1, 1))}>Previous</button>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => setCalendarAnchor(new Date())}>Today</button>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => setCalendarAnchor(new Date(calendarAnchor.getFullYear(), calendarAnchor.getMonth() + 1, 1))}>Next</button>
                  </div>
                </div>
                <InterviewCalendarView
                  interviews={interviews}
                  anchorDate={calendarAnchor}
                  onEdit={(interview) => setModalState({ open: true, interview })}
                  onCancel={(interview) => setCancelTarget(interview)}
                />
              </div>
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-white/5">
                <table className="data-table min-w-[960px]">
                  <thead>
                    <tr>
                      <th>Candidate</th>
                      <th>Interview</th>
                      <th>Schedule</th>
                      <th>Status</th>
                      <th>Sync</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {interviews.map((interview) => (
                      <tr key={interview.id}>
                        <td>
                          <div>
                            <p className="font-bold text-white">{interview.candidate?.full_name || 'Candidate'}</p>
                            <p className="text-xs text-slate-500">{interview.candidate?.email || interview.attendee_email || '—'}</p>
                          </div>
                        </td>
                        <td>
                          <p className="font-bold text-white">{interview.title}</p>
                          <p className="text-xs text-slate-500">{interview.job?.title || 'No linked job'} · {interview.interview_type || 'custom'}</p>
                          {interview.location && <p className="text-xs text-slate-500">{interview.location}</p>}
                        </td>
                        <td>
                          <p className="text-sm text-slate-200">{formatDateTime(interview.start_at)}</p>
                          <p className="text-xs text-slate-500">Ends {formatDateTime(interview.end_at)} · {interview.timezone}</p>
                        </td>
                        <td><InterviewStatusBadge status={interview.status} /></td>
                        <td>
                          <div className="flex flex-col items-start gap-2">
                            <SyncStatusBadge status={interview.sync_status} />
                            {interview.external_event_link && (
                              <a href={interview.external_event_link} target="_blank" rel="noreferrer" className="text-xs text-cyan-300 hover:text-cyan-200">Open Calendar</a>
                            )}
                          </div>
                        </td>
                        <td>
                          <div className="flex flex-wrap gap-2">
                            <GhostButton type="button" className="btn-xs" onClick={() => setModalState({ open: true, interview })}>Edit</GhostButton>
                            <SecondaryButton type="button" className="btn-xs" disabled={syncSingle.isPending} onClick={() => syncSingle.mutate(interview)}>Sync</SecondaryButton>
                            {interview.status !== 'cancelled' && <SecondaryButton type="button" className="btn-xs" onClick={() => setCancelTarget(interview)}>Cancel</SecondaryButton>}
                            <DangerButton type="button" className="btn-xs" onClick={() => setDeleteTarget(interview)}>Delete</DangerButton>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          ) : (
            <EmptyState title="No interviews found" detail="Schedule an interview or adjust filters to view existing interview records." action={<PrimaryButton type="button" onClick={() => setModalState({ open: true, interview: null })}>Schedule Interview</PrimaryButton>} />
          )}

          <div className="flex flex-col gap-3 border-t border-white/5 pt-5 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-slate-500">
              Page {interviewsQuery.data?.page || filters.page} of {interviewsQuery.data?.totalPages || 1} · {interviewsQuery.data?.total || 0} total
            </p>
            <div className="flex gap-2">
              <SecondaryButton type="button" disabled={filters.page <= 1 || interviewsQuery.isFetching} onClick={() => updateFilter('page', Math.max(1, filters.page - 1))}>Previous</SecondaryButton>
              <SecondaryButton type="button" disabled={filters.page >= (interviewsQuery.data?.totalPages || 1) || interviewsQuery.isFetching} onClick={() => updateFilter('page', filters.page + 1)}>Next</SecondaryButton>
            </div>
          </div>
        </div>
      </SectionCard>

      <InterviewFormModal
        isOpen={modalState.open}
        mode={modalState.interview ? 'edit' : 'create'}
        initialInterview={modalState.interview}
        candidates={candidates}
        jobs={jobs}
        isPending={saveInterview.isPending}
        onSubmit={(payload) => saveInterview.mutateAsync(payload)}
        onClose={() => setModalState({ open: false, interview: null })}
      />

      <ConfirmationModal
        isOpen={Boolean(cancelTarget)}
        onClose={() => setCancelTarget(null)}
        onConfirm={() => cancelMutation.mutate()}
        title="Cancel Interview"
        message={`Cancel ${cancelTarget?.title || 'this interview'}? The CRM will also remove the Google Calendar event when connected.`}
        confirmText="Cancel Interview"
        isPending={cancelMutation.isPending}
      />

      <ConfirmationModal
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteMutation.mutate()}
        title="Delete Interview"
        message={`Delete ${deleteTarget?.title || 'this interview'} permanently? Google Calendar cleanup will run before local deletion when connected.`}
        confirmText="Delete Interview"
        isPending={deleteMutation.isPending}
      />
    </AppShell>
  );
}

function Metric({ label, value, tone }) {
  const colors = {
    indigo: 'from-indigo-500/20 to-indigo-500/5 text-indigo-200',
    cyan: 'from-cyan-500/20 to-cyan-500/5 text-cyan-200',
    rose: 'from-rose-500/20 to-rose-500/5 text-rose-200',
    emerald: 'from-emerald-500/20 to-emerald-500/5 text-emerald-200',
  };
  return (
    <div className={`rounded-2xl border border-white/5 bg-gradient-to-br ${colors[tone] || colors.indigo} p-5`}>
      <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400">{label}</p>
      <p className="mt-2 text-3xl font-black text-white">{value}</p>
    </div>
  );
}
