'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getEmailStatus,
  listCandidateEmailLogs,
  listEmailTemplates,
  previewCandidateEmail,
  sendRejectionEmail,
  sendShortlistEmail,
} from '@/lib/emailData';
import { PrimaryButton, SecondaryButton } from './PrimaryButton';
import SectionCard from './SectionCard';
import EmailPreviewModal from './EmailPreviewModal';

const EMAIL_ACTIONS = {
  shortlisted: {
    label: 'Shortlist Email',
    title: 'Shortlisting Email',
    send: sendShortlistEmail,
    accent: 'text-emerald-300',
    noticeClass: 'alert-success',
    sentMessage: 'Shortlist email sent. Candidate shortlisted.',
    demoMessage: 'Demo mode: shortlist email simulated. Candidate shortlisted.',
  },
  rejected: {
    label: 'Rejection Email',
    title: 'Rejection Email',
    send: sendRejectionEmail,
    accent: 'text-rose-300',
    noticeClass: 'alert-error',
    sentMessage: 'Rejection email sent. Candidate rejected.',
    demoMessage: 'Demo mode: rejection email simulated. Candidate rejected.',
  },
};

function logLabel(log) {
  const typeLabels = {
    shortlisted: 'Shortlisted',
    rejected: 'Rejected',
    interview_scheduled: 'Interview Scheduled',
    custom: 'Email',
  };
  const status = String(log.status || 'sent');
  return `${typeLabels[log.type] || 'Email'} · ${status}`;
}

function logToneClass(log) {
  if (log.status === 'failed' || log.type === 'rejected') return 'text-rose-300';
  if (log.status === 'demo') return 'text-amber-300';
  if (log.type === 'shortlisted') return 'text-emerald-300';
  return 'text-emerald-300';
}

export default function CandidateEmailPanel({ candidate, selectedJobId, onEmailSent }) {
  const queryClient = useQueryClient();
  const [notice, setNotice] = useState(null);
  const [error, setError] = useState('');
  const [activeType, setActiveType] = useState('shortlisted');
  const [activePreview, setActivePreview] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const statusQuery = useQuery({
    queryKey: ['email-status'],
    queryFn: getEmailStatus,
  });

  const templatesQuery = useQuery({
    queryKey: ['email-templates'],
    queryFn: () => listEmailTemplates(),
  });

  const logsQuery = useQuery({
    enabled: Boolean(candidate?.id),
    queryKey: ['candidate-email-logs', candidate?.id],
    queryFn: () => listCandidateEmailLogs(candidate.id),
  });

  const templateByType = useMemo(() => {
    const map = new Map();
    for (const template of templatesQuery.data?.templates || []) {
      if (!map.has(template.type) || !template.is_default) map.set(template.type, template);
    }
    return map;
  }, [templatesQuery.data?.templates]);

  const previewMutation = useMutation({
    mutationFn: ({ type }) => previewCandidateEmail({
      candidateId: candidate.id,
      type,
      templateId: templateByType.get(type)?.id,
      jobId: selectedJobId || undefined,
    }),
    onMutate: () => {
      setNotice(null);
      setError('');
    },
    onSuccess: (result, variables) => {
      setActiveType(variables.type);
      setActivePreview(result.preview);
      setIsModalOpen(true);
    },
    onError: (caught) => setError(caught.message || 'Could not preview email.'),
  });

  const sendMutation = useMutation({
    mutationFn: ({ type, overrides }) => EMAIL_ACTIONS[type].send({
      candidateId: candidate.id,
      type,
      templateId: activePreview?.templateId,
      jobId: selectedJobId || undefined,
      ...overrides,
    }),
    onMutate: () => {
      setNotice(null);
      setError('');
    },
    onSuccess: (result, variables) => {
      const action = EMAIL_ACTIONS[variables.type] || EMAIL_ACTIONS.shortlisted;
      setIsModalOpen(false);
      setNotice({
        message: result.status === 'demo' ? action.demoMessage : action.sentMessage,
        className: action.noticeClass,
      });
      queryClient.invalidateQueries({ queryKey: ['candidate-email-logs', candidate.id] });
      queryClient.invalidateQueries({ queryKey: ['analytics-page'] });
      queryClient.invalidateQueries({ queryKey: ['analytics-summary'] });
      onEmailSent?.(result);
    },
    onError: (caught) => {
      const log = caught?.body?.emailLog;
      if (log) queryClient.invalidateQueries({ queryKey: ['candidate-email-logs', candidate.id] });
      setError(caught.message || 'Could not send email.');
    },
  });

  const missingEmail = !candidate?.email;
  const latestLogs = (logsQuery.data?.logs || []).slice(0, 3);
  const status = statusQuery.data;

  async function handleSend(overrides) {
    await sendMutation.mutateAsync({ type: activeType, overrides });
  }

  return (
    <SectionCard
      title="Email Automation"
      description="Preview and send stage-aware candidate emails through SMTP."
    >
      <div className="space-y-4">
        {status && (
          <div className={`rounded-xl border px-4 py-3 text-xs leading-relaxed ${status.configured ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-100' : 'border-amber-500/20 bg-amber-500/10 text-amber-100'}`}>
            {status.demoMode
              ? 'Demo mode active: email sends are simulated and logged locally.'
              : status.configured
                ? 'SMTP is configured for live email sending.'
                : 'SMTP is not configured. Preview is available, but live sending needs SMTP_HOST, SMTP_USER, SMTP_PASS, and SMTP_FROM_EMAIL.'}
          </div>
        )}

        {missingEmail && (
          <div className="rounded-xl border border-rose-500/25 bg-rose-500/10 px-4 py-3 text-xs leading-relaxed text-rose-100">
            Add an email address to this candidate before sending outreach.
          </div>
        )}

        {notice && <div className={`alert ${notice.className}`}>{notice.message}</div>}
        {error && <div className="alert alert-error">{error}</div>}

        <div className="grid gap-3 sm:grid-cols-2">
          <SecondaryButton
            type="button"
            disabled={previewMutation.isPending}
            onClick={() => previewMutation.mutate({ type: 'shortlisted' })}
            className="justify-center"
          >
            {previewMutation.isPending && activeType === 'shortlisted' ? 'Previewing…' : 'Preview Shortlist Email'}
          </SecondaryButton>
          <SecondaryButton
            type="button"
            disabled={previewMutation.isPending}
            onClick={() => previewMutation.mutate({ type: 'rejected' })}
            className="justify-center"
          >
            {previewMutation.isPending && activeType === 'rejected' ? 'Previewing…' : 'Preview Rejection Email'}
          </SecondaryButton>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <PrimaryButton
            type="button"
            disabled={missingEmail || previewMutation.isPending}
            onClick={() => previewMutation.mutate({ type: 'shortlisted' })}
            className="justify-center"
          >
            Send Shortlist Email
          </PrimaryButton>
          <PrimaryButton
            type="button"
            disabled={missingEmail || previewMutation.isPending}
            onClick={() => previewMutation.mutate({ type: 'rejected' })}
            className="justify-center bg-rose-500 hover:bg-rose-400"
          >
            Send Rejection Email
          </PrimaryButton>
        </div>

        <div className="border-t border-white/5 pt-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Recent Email Logs</p>
          <div className="mt-3 space-y-2">
            {logsQuery.isLoading ? (
              <div className="h-12 rounded-xl skeleton" />
            ) : latestLogs.length ? latestLogs.map((log) => (
              <div key={log.id} className="rounded-xl border border-white/5 bg-white/[0.015] px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <p className={`text-xs font-bold capitalize ${logToneClass(log)}`}>
                    {logLabel(log)}
                  </p>
                  <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">
                    {log.created_at ? new Date(log.created_at).toLocaleDateString() : '—'}
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-400 line-clamp-1">{log.subject}</p>
              </div>
            )) : (
              <p className="text-xs text-slate-600">No email activity logged for this candidate yet.</p>
            )}
          </div>
        </div>
      </div>

      <EmailPreviewModal
        isOpen={isModalOpen}
        typeLabel={EMAIL_ACTIONS[activeType]?.title || 'Email'}
        preview={activePreview}
        isPending={sendMutation.isPending}
        onClose={() => !sendMutation.isPending && setIsModalOpen(false)}
        onSend={handleSend}
      />
    </SectionCard>
  );
}
