'use client';

import { apiGet, apiPatch, apiPost } from './api';
import { isSupabaseConfigured } from './supabaseClient';

const DEMO_STORE_KEY = 'ai-recruitment-crm-frontend-demo-store-v1';

const DEFAULT_TEMPLATES = [
  {
    id: 'demo-template-shortlisted',
    name: 'shortlisted_default',
    type: 'shortlisted',
    is_default: true,
    subject: 'You have been shortlisted for {{job_title}} at {{company_name}}',
    body: `Hi {{candidate_name}},

We are excited to let you know that you have been shortlisted for the {{job_title}} position at {{company_name}}.

Our team was impressed by your background and we would like to move forward in the process.

We will be in touch shortly with next steps.

Best regards,
{{recruiter_name}}`,
  },
  {
    id: 'demo-template-rejected',
    name: 'rejected_default',
    type: 'rejected',
    is_default: true,
    subject: 'Update on your application for {{job_title}}',
    body: `Hi {{candidate_name}},

Thank you for taking the time to apply for the {{job_title}} position at {{company_name}}.

After careful consideration, we have decided to move forward with other candidates whose experience more closely matches our current needs.

We appreciate your interest and encourage you to apply for future openings.

Best regards,
{{recruiter_name}}`,
  },
];

function nowIso() {
  return new Date().toISOString();
}

function createId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function loadDemoStore() {
  if (typeof window === 'undefined') return { candidates: [], jobs: [], scores: [], emails: [], emailTemplates: clone(DEFAULT_TEMPLATES) };
  try {
    const raw = window.localStorage.getItem(DEMO_STORE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return {
      candidates: [],
      jobs: [],
      scores: [],
      emails: [],
      emailTemplates: clone(DEFAULT_TEMPLATES),
      ...parsed,
      emails: Array.isArray(parsed.emails) ? parsed.emails : [],
      emailTemplates: Array.isArray(parsed.emailTemplates) && parsed.emailTemplates.length ? parsed.emailTemplates : clone(DEFAULT_TEMPLATES),
    };
  } catch {
    return { candidates: [], jobs: [], scores: [], emails: [], emailTemplates: clone(DEFAULT_TEMPLATES) };
  }
}

function saveDemoStore(store) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(DEMO_STORE_KEY, JSON.stringify(store));
}

function renderTemplate(template = '', variables = {}) {
  return String(template || '').replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_match, key) => {
    const value = variables[key];
    return value === undefined || value === null ? '' : String(value);
  });
}

function buildDemoPreview(payload) {
  const store = loadDemoStore();
  const candidate = store.candidates.find((item) => item.id === payload.candidateId);
  if (!candidate) throw new Error('Candidate not found.');

  const latestScore = [...(store.scores || [])]
    .filter((score) => score.candidate_id === candidate.id && score.job_id)
    .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))[0];
  const job = payload.jobId
    ? store.jobs.find((item) => item.id === payload.jobId)
    : store.jobs.find((item) => item.id === latestScore?.job_id);
  const type = payload.type || 'shortlisted';
  const template = payload.subject || payload.body
    ? { subject: payload.subject || '', body: payload.body || '', type }
    : store.emailTemplates.find((item) => item.id === payload.templateId)
      || store.emailTemplates.find((item) => item.type === type)
      || DEFAULT_TEMPLATES.find((item) => item.type === type)
      || DEFAULT_TEMPLATES[0];
  const variables = {
    candidate_name: candidate.full_name || candidate.email || 'Candidate',
    candidate_email: candidate.email || '',
    job_title: job?.title || payload.variables?.job_title || 'the role',
    company_name: payload.variables?.company_name || 'our company',
    recruiter_name: 'Demo Recruiter',
    ...(payload.variables || {}),
  };
  const subject = renderTemplate(template.subject, variables).trim();
  const body = renderTemplate(template.body, variables).trim();

  return {
    candidate,
    preview: {
      candidateId: candidate.id,
      recipientEmail: String(payload.to || candidate.email || '').trim().toLowerCase(),
      recipientName: candidate.full_name || candidate.email || 'Candidate',
      type,
      templateId: template.id || null,
      subject,
      body,
      html: body.replace(/\r?\n/g, '<br>'),
    },
  };
}

export async function getEmailStatus() {
  if (!isSupabaseConfigured()) {
    return { provider: 'nodemailer', configured: false, senderConfigured: false, demoMode: true };
  }
  return apiGet('/api/emails/status', { auth: true });
}

export async function listEmailTemplates(type) {
  if (!isSupabaseConfigured()) {
    const store = loadDemoStore();
    return { templates: store.emailTemplates.filter((template) => !type || template.type === type) };
  }
  const query = type ? `?type=${encodeURIComponent(type)}` : '';
  return apiGet(`/api/emails/templates${query}`, { auth: true });
}

export async function updateEmailTemplate(id, payload) {
  if (!isSupabaseConfigured()) {
    const store = loadDemoStore();
    const existing = store.emailTemplates.find((template) => template.id === id);
    const template = {
      ...(existing || {}),
      id: existing?.is_default ? createId('template') : id,
      name: existing?.is_default ? `${payload.type}_demo_custom` : existing?.name || `${payload.type}_custom`,
      type: payload.type,
      subject: payload.subject,
      body: payload.body,
      is_default: false,
      created_by: 'demo-user',
      updated_at: nowIso(),
    };
    const index = store.emailTemplates.findIndex((item) => item.id === template.id);
    if (index >= 0) store.emailTemplates[index] = template;
    else store.emailTemplates.unshift(template);
    saveDemoStore(store);
    return { template };
  }
  return apiPatch(`/api/emails/templates/${id}`, payload, { auth: true });
}

export async function previewCandidateEmail(payload) {
  if (!isSupabaseConfigured()) {
    const { preview } = buildDemoPreview(payload);
    return { preview, status: await getEmailStatus() };
  }
  return apiPost('/api/emails/preview', payload, { auth: true });
}

async function sendCandidateEmail(path, payload) {
  if (!isSupabaseConfigured()) {
    const { candidate, preview } = buildDemoPreview(payload);
    if (!preview.recipientEmail) throw new Error('Candidate email is required before sending.');
    if (!preview.subject.trim()) throw new Error('Email subject is required.');
    if (!preview.body.trim()) throw new Error('Email body is required.');
    const store = loadDemoStore();
    const emailLog = {
      id: createId('email'),
      candidate_id: candidate.id,
      type: preview.type,
      recipient_email: preview.recipientEmail,
      external_message_id: 'demo-mode',
      subject: preview.subject,
      body_preview: preview.body.replace(/\s+/g, ' ').slice(0, 220),
      status: 'demo',
      provider: 'nodemailer',
      sent_at: nowIso(),
      created_by: 'demo-user',
      created_at: nowIso(),
    };
    store.emails.unshift(emailLog);
    saveDemoStore(store);
    return { preview, emailLog, status: 'demo', message: 'Demo mode: email send simulated.' };
  }
  return apiPost(path, payload, { auth: true });
}

export function sendShortlistEmail(payload) {
  return sendCandidateEmail('/api/emails/shortlist', payload);
}

export function sendRejectionEmail(payload) {
  return sendCandidateEmail('/api/emails/rejection', payload);
}

export function sendGenericEmail(payload) {
  return sendCandidateEmail('/api/emails/send', payload);
}

export async function listCandidateEmailLogs(candidateId) {
  if (!isSupabaseConfigured()) {
    const store = loadDemoStore();
    return {
      logs: [...(store.emails || [])]
        .filter((item) => item.candidate_id === candidateId)
        .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)),
    };
  }
  return apiGet(`/api/emails/logs?candidateId=${encodeURIComponent(candidateId)}`, { auth: true });
}
