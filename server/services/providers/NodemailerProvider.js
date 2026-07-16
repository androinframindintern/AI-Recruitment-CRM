import nodemailer from 'nodemailer';

let pooledTransporter = null;
let pooledConfigKey = '';

function parseBoolean(value) {
  return ['true', '1', 'yes', 'on'].includes(String(value || '').trim().toLowerCase());
}

function readConfig() {
  const port = Number(process.env.SMTP_PORT || 587);
  return {
    host: process.env.SMTP_HOST || '',
    port: Number.isFinite(port) ? port : 587,
    secure: parseBoolean(process.env.SMTP_SECURE),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    fromEmail: process.env.SMTP_FROM_EMAIL || '',
    fromName: process.env.SMTP_FROM_NAME || 'AI Recruitment CRM',
  };
}

function configKey(config) {
  return JSON.stringify({
    host: config.host,
    port: config.port,
    secure: config.secure,
    user: config.user,
    fromEmail: config.fromEmail,
  });
}

function isConfigured(config) {
  return Boolean(config.host && config.port && config.user && config.pass && config.fromEmail);
}

function providerError(message, status = 502, details = {}) {
  return Object.assign(new Error(message), {
    status,
    provider: 'nodemailer',
    details,
  });
}

function getTransporter(config) {
  const key = configKey(config);
  if (pooledTransporter && pooledConfigKey === key) return pooledTransporter;

  pooledTransporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: {
      user: config.user,
      pass: config.pass,
    },
    pool: true,
    maxConnections: 3,
    maxMessages: 100,
  });
  pooledConfigKey = key;
  return pooledTransporter;
}

export class NodemailerProvider {
  constructor(config = readConfig()) {
    this.config = config;
  }

  getStatus() {
    return {
      provider: 'nodemailer',
      configured: isConfigured(this.config),
      hostConfigured: Boolean(this.config.host),
      userConfigured: Boolean(this.config.user),
      senderConfigured: Boolean(this.config.fromEmail),
      port: this.config.port,
      secure: this.config.secure,
      senderName: this.config.fromName,
    };
  }

  isConfigured() {
    return this.getStatus().configured;
  }

  async sendEmail({ to, subject, textContent, htmlContent, text, html }) {
    if (!this.isConfigured()) {
      return {
        success: true,
        provider: 'demo',
        messageId: 'demo-mode',
        error: null,
      };
    }

    const transporter = getTransporter(this.config);

    try {
      const info = await transporter.sendMail({
        from: {
          name: this.config.fromName || 'AI Recruitment CRM',
          address: this.config.fromEmail,
        },
        to: {
          name: to?.name || to?.email || '',
          address: to?.email || to,
        },
        subject,
        text: textContent || text || '',
        html: htmlContent || html || undefined,
      });

      return {
        success: true,
        provider: 'nodemailer',
        messageId: info?.messageId || '',
        error: null,
      };
    } catch (error) {
      throw providerError('SMTP email could not be sent.', 502, {
        code: error?.code || 'SMTP_SEND_FAILED',
        command: error?.command,
        responseCode: error?.responseCode,
      });
    }
  }
}

export function createNodemailerProvider() {
  return new NodemailerProvider();
}
