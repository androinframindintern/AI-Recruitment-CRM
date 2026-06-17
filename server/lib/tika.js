import mammoth from 'mammoth';
import { PDFParse } from 'pdf-parse';

function extensionFromName(name = '') {
  const parts = String(name).toLowerCase().split('.');
  return parts.length > 1 ? parts.pop() : '';
}

async function parseWithTikaServer(buffer, filename, mimeType) {
  const endpoint = process.env.TIKA_SERVER_URL;
  if (!endpoint) return null;

  const response = await fetch(`${endpoint.replace(/\/+$/, '')}/tika`, {
    method: 'PUT',
    headers: {
      'Content-Type': mimeType || 'application/octet-stream',
      'Accept': 'text/plain',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
    body: buffer,
  });

  if (!response.ok) {
    throw new Error('Apache Tika server request failed');
  }

  return (await response.text()).trim();
}

async function parseLocally(buffer, filename, mimeType) {
  const extension = extensionFromName(filename);
  if (extension === 'docx' || mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    const result = await mammoth.extractRawText({ buffer });
    return result.value.trim();
  }

  if (extension === 'pdf' || mimeType === 'application/pdf') {
    const parser = new PDFParse({ data: buffer });
    const result = await parser.getText();
    return (result.text || '').trim();
  }

  return buffer.toString('utf8').trim();
}

export async function extractResumeText({ buffer, filename, mimeType }) {
  try {
    const tikaText = await parseWithTikaServer(buffer, filename, mimeType);
    if (tikaText) return tikaText;
  } catch {}

  const localText = await parseLocally(buffer, filename, mimeType);
  if (!localText) throw new Error('Could not extract text from the uploaded resume');
  return localText;
}
