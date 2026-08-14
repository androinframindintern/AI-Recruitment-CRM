import { getDemoStore, nextId } from '../demoStore.js';
import { supabaseAdmin, supabaseConfigured } from '../supabase.js';
import { createNodemailerProvider } from '../../services/providers/NodemailerProvider.js';
import {
  DEFAULT_EMAIL_TEMPLATES,
  compactBodyPreview,
  findDefaultTemplate,
  renderTemplate,
  textToHtml,
} from './templateRenderer.js';

function httpError(message, status = 400, details = {}) {
  return Object.assign(new Error(message), { status, details });
}

function isAdmin(profile) {
  return profile?.role === 'admin';
}

function safeDate(value) {
  const date = new Date(value || Date.now());
  return Number.isFinite(date.getTime()) ? date : new Date();
}

function sortNewest(items = []) {
  return [...items].sort((a, b) => safeDate(b.created_at).getTime() - safeDate(a.created_at).getTime());
}

function sanitizeTemplate(template = {}) {
  return {
    id: template.id,
    name: template.name || '',
    type: template.type || 'custom',
    subject: template.subject || '',
    body: template.body || '',
    is_default: Boolean(template.is_default),
    created_by: template.created_by || null,
    created_at: template.created_at || null,
    updated_at: template.updated_at || template.created_at || null,
  };
}

function sanitizeLog(log = {}) {
  return {
    id: log.id,
    candidate_id: log.candidate_id,
    type: log.type,
    recipient_email: log.recipient_email,
    external_message_id: log.external_message_id || '',
    subject: log.subject || '',
    body_preview: log.body_preview || '',
    status: log.status || 'sent',
    provider: log.provider || 'nodemailer',
    sent_at: log.sent_at || null,
    created_by: log.created_by || null,
    created_at: log.created_at || null,
  };
}

function defaultTemplates() {
  const now = new Date().toISOString();
  return DEFAULT_EMAIL_TEMPLATES.map((template) => sanitizeTemplate({
    ...template,
    created_at: now,
    updated_at: now,
  }));
}

function ensureDemoEmailTemplates(store) {
  if (!Array.isArray(store.emailTemplates) || !store.emailTemplates.length) {
    store.emailTemplates = defaultTemplates();
  }
  return store.emailTemplates;
}

function findDemoTemplate(store, type, templateId) {
  const templates = ensureDemoEmailTemplates(store).filter((template) => template.type === type);
  return templates.find((template) => template.id === templateId)
    || templates.find((template) => template.is_default)
    || sanitizeTemplate(findDefaultTemplate(type));
}

function dateParts(value) {
  if (!value) return { date: '', time: '' };
  const date = safeDate(value);
  return {
    date: date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }),
    time: date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
  };
}

function formatApplicationDate(value) {
  return safeDate(value).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

function formatSource(value) {
  return String(value || 'public_careers')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function buildAtsLink(candidateId) {
  const path = `/candidates/${candidateId}`;
  const origin = String(process.env.FRONTEND_ORIGIN || process.env.NEXT_PUBLIC_APP_URL || '').trim().replace(/\/+$/, '');
  return origin ? `${origin}${path}` : path;
}

async function insertEmailLogWithFallback(emailLog) {
  const ignoredColumns = new Set();

  while (true) {
    const payload = Object.fromEntries(
      Object.entries(emailLog).filter(([key]) => !ignoredColumns.has(key)),
    );

    const result = await supabaseAdmin
      .from('email_logs')
      .insert(payload)
      .select('*')
      .single();

    if (!result.error) return result;

    const message = result.error?.message || '';
    const match = message.match(/Could not find the '([^']+)' column of 'email_logs' in the schema cache/i);
    const column = match?.[1];
    const shouldRetry = column && Object.hasOwn(emailLog, column) && !ignoredColumns.has(column);
    if (!shouldRetry) return result;

    ignoredColumns.add(column);
    console.warn(`Supabase email_logs table is missing "${column}". Retrying insert without that column.`);
  }
}

export class EmailService {
  constructor({ provider = createNodemailerProvider() } = {}) {
    this.provider = provider;
  }

  getStatus() {
    const providerStatus = this.provider.getStatus();
    return {
      provider: providerStatus.provider || 'nodemailer',
      configured: providerStatus.configured,
      senderConfigured: providerStatus.senderConfigured,
      demoMode: !supabaseConfigured,
    };
  }

  async listTemplates(ctx, { type } = {}) {
    if (!supabaseConfigured) {
      const store = getDemoStore();
      const templates = ensureDemoEmailTemplates(store)
        .filter((template) => !type || template.type === type)
        .map(sanitizeTemplate);
      return { templates };
    }

    let query = supabaseAdmin
      .from('email_templates')
      .select('*')
      .order('is_default', { ascending: false })
      .order('updated_at', { ascending: false });

    if (type) query = query.eq('type', type);

    const { data, error } = await query;
    if (error) throw httpError(error.message || 'Could not load email templates.', 500);

    const userId = ctx.user?.id;
    const templates = (data || [])
      .filter((template) => template.is_default || template.created_by === userId || isAdmin(ctx.profile))
      .map(sanitizeTemplate);

    return { templates };
  }

  async updateTemplate(ctx, id, payload) {
    if (!supabaseConfigured) {
      const store = getDemoStore();
      const templates = ensureDemoEmailTemplates(store);
      const existing = templates.find((template) => template.id === id) || findDemoTemplate(store, payload.type, id);
      const copyId = existing.is_default ? nextId('template') : existing.id;
      const next = sanitizeTemplate({
        ...existing,
        ...payload,
        id: copyId,
        name: existing.is_default ? `${payload.type || existing.type}_demo_custom` : existing.name,
        is_default: false,
        created_by: ctx.user?.id || 'demo-user',
        updated_at: new Date().toISOString(),
      });
      const index = templates.findIndex((template) => template.id === copyId);
      if (index >= 0) templates[index] = next;
      else templates.unshift(next);
      return { template: next };
    }

    const { data: existing, error: loadError } = await supabaseAdmin
      .from('email_templates')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (loadError) throw httpError(loadError.message || 'Could not load email template.', 500);
    if (!existing) throw httpError('Email template not found.', 404);

    const userId = ctx.user?.id;
    const updates = {
      subject: payload.subject,
      body: payload.body,
      type: payload.type || existing.type,
      updated_at: new Date().toISOString(),
    };

    if (existing.is_default) {
      const customName = `${updates.type}_${userId}_custom`;
      const { data, error } = await supabaseAdmin
        .from('email_templates')
        .upsert({
          name: customName,
          subject: updates.subject,
          body: updates.body,
          type: updates.type,
          is_default: false,
          created_by: userId,
          updated_at: updates.updated_at,
        }, { onConflict: 'name' })
        .select('*')
        .single();

      if (error) throw httpError(error.message || 'Could not save email template.', 500);
      return { template: sanitizeTemplate(data) };
    }

    if (existing.created_by !== userId && !isAdmin(ctx.profile)) {
      throw httpError('You can only edit your own email templates.', 403);
    }

    const { data, error } = await supabaseAdmin
      .from('email_templates')
      .update(updates)
      .eq('id', existing.id)
      .select('*')
      .single();

    if (error) throw httpError(error.message || 'Could not update email template.', 500);
    return { template: sanitizeTemplate(data) };
  }

  async findCandidate(ctx, candidateId) {
    if (!candidateId) throw httpError('Candidate is required.', 400);

    if (!supabaseConfigured) {
      const store = getDemoStore();
      const candidate = store.candidates.find((item) => item.id === candidateId);
      if (!candidate) throw httpError('Candidate not found.', 404);
      return candidate;
    }

    let query = supabaseAdmin.from('candidates').select('*').eq('id', candidateId);
    if (!isAdmin(ctx.profile)) query = query.eq('owner_id', ctx.user.id);
    const { data, error } = await query.maybeSingle();
    if (error) throw httpError(error.message || 'Could not load candidate.', 500);
    if (!data) throw httpError('Candidate not found.', 404);
    return data;
  }

  async findJob(ctx, candidateId, jobId) {
    if (!supabaseConfigured) {
      const store = getDemoStore();
      if (jobId) return store.jobs.find((job) => job.id === jobId) || null;
      const score = sortNewest(store.scores.filter((item) => item.candidate_id === candidateId && item.job_id))[0];
      return score ? store.jobs.find((job) => job.id === score.job_id) || null : null;
    }

    let targetJobId = jobId;
    if (!targetJobId) {
      const { data: score } = await supabaseAdmin
        .from('candidate_job_scores')
        .select('job_id, created_at')
        .eq('candidate_id', candidateId)
        .not('job_id', 'is', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      targetJobId = score?.job_id || '';
    }

    if (!targetJobId) return null;

    let query = supabaseAdmin.from('jobs').select('*').eq('id', targetJobId);
    if (!isAdmin(ctx.profile)) query = query.eq('owner_id', ctx.user.id);
    const { data } = await query.maybeSingle();
    return data || null;
  }

  async findTemplate(ctx, type, templateId) {
    if (!supabaseConfigured) {
      return findDemoTemplate(getDemoStore(), type, templateId);
    }

    let query = supabaseAdmin.from('email_templates').select('*').eq('type', type);
    if (templateId) query = query.eq('id', templateId);
    const { data, error } = await query.order('is_default', { ascending: false }).order('updated_at', { ascending: false });

    if (error) throw httpError(error.message || 'Could not load email template.', 500);

    const userId = ctx.user?.id;
    const templates = (data || []).filter((template) => template.is_default || template.created_by === userId || isAdmin(ctx.profile));
    return sanitizeTemplate(templates[0] || findDefaultTemplate(type));
  }

  async buildPreview(ctx, payload) {
    const type = payload.type || 'custom';
    const candidate = await this.findCandidate(ctx, payload.candidateId);
    const job = await this.findJob(ctx, candidate.id, payload.jobId);
    const template = payload.subject || payload.body
      ? sanitizeTemplate({
        id: payload.templateId || null,
        name: 'custom_override',
        type,
        subject: payload.subject || '',
        body: payload.body || '',
      })
      : await this.findTemplate(ctx, type, payload.templateId);

    const latestInterview = !supabaseConfigured
      ? sortNewest(getDemoStore().interviews.filter((item) => item.candidate_id === candidate.id))[0]
      : null;
    const interviewDate = dateParts(latestInterview?.start_at);
    const recruiterName = ctx.profile?.full_name || ctx.user?.user_metadata?.full_name || ctx.user?.email?.split('@')[0] || 'Recruiter';

    const variables = {
      candidate_name: candidate.full_name || candidate.email || 'Candidate',
      candidate_email: candidate.email || '',
      job_title: job?.title || payload.variables?.job_title || 'the role',
      company_name: payload.variables?.company_name || process.env.COMPANY_NAME || 'our company',
      recruiter_name: recruiterName,
      interview_date: payload.variables?.interview_date || interviewDate.date,
      interview_time: payload.variables?.interview_time || interviewDate.time,
      duration: payload.variables?.duration || '60',
      interview_format: payload.variables?.interview_format || latestInterview?.interview_type || 'Online',
      calendar_link: payload.variables?.calendar_link || latestInterview?.external_event_link || '',
      ...(payload.variables || {}),
    };

    const subject = renderTemplate(template.subject, variables).trim();
    const body = renderTemplate(template.body, variables).trim();
    const recipientEmail = String(payload.to || candidate.email || '').trim().toLowerCase();

    return {
      candidate,
      template,
      preview: {
        candidateId: candidate.id,
        recipientEmail,
        recipientName: candidate.full_name || recipientEmail,
        type,
        templateId: template.id || null,
        subject,
        body,
        html: textToHtml(body),
      },
    };
  }

  async previewCandidateEmail(ctx, payload) {
    const { preview } = await this.buildPreview(ctx, payload);
    return { preview, status: this.getStatus() };
  }

  async createLog(ctx, candidateId, preview, status, externalMessageId = '') {
    const createdAt = new Date().toISOString();
    const log = sanitizeLog({
      id: !supabaseConfigured ? nextId('email') : undefined,
      candidate_id: candidateId,
      type: preview.type,
      recipient_email: preview.recipientEmail,
      external_message_id: externalMessageId,
      subject: preview.subject,
      body_preview: compactBodyPreview(preview.body),
      status,
      provider: status === 'demo' ? 'demo' : 'nodemailer',
      sent_at: status === 'sent' || status === 'demo' ? createdAt : null,
      created_by: ctx.user?.id || null,
      created_at: createdAt,
    });

    if (!supabaseConfigured) {
      const store = getDemoStore();
      store.emails.unshift(log);
      return log;
    }

    const { data, error } = await insertEmailLogWithFallback(log);
    if (error) throw httpError(error.message || 'Could not save email log.', 500);
    return sanitizeLog(data);
  }

  async sendAndLogCustomEmail(ctx, {
    candidateId,
    recipientEmail,
    recipientName = '',
    subject,
    body,
  } = {}) {
    const preview = {
      candidateId,
      recipientEmail: String(recipientEmail || '').trim().toLowerCase(),
      recipientName: recipientName || recipientEmail || '',
      type: 'custom',
      templateId: null,
      subject: String(subject || '').trim(),
      body: String(body || '').trim(),
      html: textToHtml(body),
    };

    if (!candidateId) throw httpError('Candidate is required before sending.', 422);
    if (!preview.recipientEmail) throw httpError('Recipient email is required before sending.', 422);
    if (!preview.subject) throw httpError('Email subject is required.', 422);
    if (!preview.body) throw httpError('Email body is required.', 422);

    if (!supabaseConfigured) {
      const emailLog = await this.createLog(ctx, candidateId, preview, 'demo', 'demo-mode');
      return { preview, emailLog, status: 'demo', message: 'Demo mode: email send simulated.' };
    }

    try {
      const result = await this.provider.sendEmail({
        to: { email: preview.recipientEmail, name: preview.recipientName },
        subject: preview.subject,
        textContent: preview.body,
        htmlContent: preview.html,
      });
      const status = result.provider === 'demo' ? 'demo' : 'sent';
      const emailLog = await this.createLog(ctx, candidateId, preview, status, result.messageId);
      return {
        preview,
        emailLog,
        status,
        provider: result.provider,
        message: result.provider === 'demo' ? 'SMTP not configured: email send simulated.' : undefined,
      };
    } catch (error) {
      const emailLog = await this.createLog(ctx, candidateId, preview, 'failed');
      throw httpError(error.message || 'Email could not be sent.', error.status || 502, {
        code: error.details?.code || 'EMAIL_SEND_FAILED',
        emailLog,
      });
    }
  }

  async sendPublicApplicationNotifications(ctx, {
    candidate = {},
    job = {},
    application = {},
    applicant = {},
    recruiter = null,
  } = {}) {
    const results = { candidate: 'skipped', recruiter: 'skipped' };
    const candidateId = candidate.id;
    const candidateName = candidate.full_name || applicant.full_name || candidate.email || applicant.email || 'Candidate';
    const candidateEmail = candidate.email || applicant.email || application.applicant_email || '';
    const jobTitle = job.title || 'the role';
    const companyName = process.env.COMPANY_NAME || 'our company';
    const applicationDate = formatApplicationDate(application.created_at || new Date().toISOString());
    const source = formatSource(application.source || 'public_careers');

    if (candidateEmail) {
      try {
        await this.sendAndLogCustomEmail(ctx, {
          candidateId,
          recipientEmail: candidateEmail,
          recipientName: candidateName,
          subject: `Application Received – ${jobTitle}`,
          body: `Hi ${candidateName},

Thank you for applying to ${companyName}. We have received your application for the ${jobTitle} position on ${applicationDate}.

Our recruiting team will review your resume and application details in the existing hiring workflow. If your background matches the next stage of the process, we will contact you with next steps.

Thank you for your interest in ${companyName}.

Best regards,
${companyName} Recruiting Team`,
        });
        results.candidate = 'sent';
      } catch (error) {
        results.candidate = 'failed';
        console.warn('Public application candidate confirmation email failed:', error?.message || error);
      }
    }

    if (recruiter?.email) {
      try {
        await this.sendAndLogCustomEmail(ctx, {
          candidateId,
          recipientEmail: recruiter.email,
          recipientName: recruiter.full_name || recruiter.email,
          subject: `New Application: ${candidateName} for ${jobTitle}`,
          body: `Hi ${recruiter.full_name || 'Recruiter'},

A new public career-site application has been submitted.

Candidate: ${candidateName}
Job: ${jobTitle}
Email: ${candidateEmail || '—'}
Phone: ${applicant.phone || candidate.phone || '—'}
Application date: ${applicationDate}
Source: ${source}
ATS profile: ${buildAtsLink(candidateId)}

Please review this candidate in the existing ATS pipeline.`,
        });
        results.recruiter = 'sent';
      } catch (error) {
        results.recruiter = 'failed';
        console.warn('Public application recruiter notification email failed:', error?.message || error);
      }
    } else {
      console.warn('Public application recruiter notification skipped: recruiter email not found.');
    }

    return results;
  }

  async sendCandidateEmail(ctx, payload) {
    const { candidate, preview } = await this.buildPreview(ctx, payload);

    if (!preview.recipientEmail) throw httpError('Candidate email is required before sending.', 422);
    if (!preview.subject) throw httpError('Email subject is required.', 422);
    if (!preview.body) throw httpError('Email body is required.', 422);

    if (!supabaseConfigured) {
      const emailLog = await this.createLog(ctx, candidate.id, preview, 'demo', 'demo-mode');
      return { preview, emailLog, status: 'demo', message: 'Demo mode: email send simulated.' };
    }

    try {
      const result = await this.provider.sendEmail({
        to: { email: preview.recipientEmail, name: preview.recipientName },
        subject: preview.subject,
        textContent: preview.body,
        htmlContent: preview.html,
      });
      const status = result.provider === 'demo' ? 'demo' : 'sent';
      const emailLog = await this.createLog(ctx, candidate.id, preview, status, result.messageId);
      return {
        preview,
        emailLog,
        status,
        provider: result.provider,
        message: result.provider === 'demo' ? 'SMTP not configured: email send simulated.' : undefined,
      };
    } catch (error) {
      const emailLog = await this.createLog(ctx, candidate.id, preview, 'failed');
      throw httpError(error.message || 'Email could not be sent.', error.status || 502, {
        code: error.details?.code || 'EMAIL_SEND_FAILED',
        emailLog,
      });
    }
  }

  async listLogs(ctx, { candidateId, limit = 20 } = {}) {
    const candidate = await this.findCandidate(ctx, candidateId);

    if (!supabaseConfigured) {
      const store = getDemoStore();
      return {
        logs: sortNewest(store.emails.filter((item) => item.candidate_id === candidate.id))
          .slice(0, limit)
          .map(sanitizeLog),
      };
    }

    const { data, error } = await supabaseAdmin
      .from('email_logs')
      .select('*')
      .eq('candidate_id', candidate.id)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw httpError(error.message || 'Could not load email logs.', 500);
    return { logs: (data || []).map(sanitizeLog) };
  }
}

export function createEmailService(options = {}) {
  return new EmailService(options);
}
