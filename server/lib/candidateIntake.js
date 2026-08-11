import { extractResumeText } from './tika.js';
import { parseResumeWithGemini } from './gemini.js';
import { ensureCandidateEmbedding } from './embeddings.js';
import { getDemoStore, nextId } from './demoStore.js';
import { supabaseAdmin, supabaseConfigured } from './supabase.js';

export const RESUME_UPLOAD_LIMIT_BYTES = 8 * 1024 * 1024;
export const RESUME_UPLOAD_LIMIT_LABEL = '8 MB';

const ALLOWED_RESUME_MIME_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'application/octet-stream',
]);

const ALLOWED_RESUME_EXTENSIONS = new Set(['pdf', 'doc', 'docx', 'txt']);

export function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

export function candidateShape(candidate) {
  return {
    ...candidate,
    skills: normalizeArray(candidate.skills),
    education: normalizeArray(candidate.education),
    experience: normalizeArray(candidate.experience),
  };
}

function parseYearsExperience(val) {
  if (typeof val === 'number') return val;
  if (!val) return 0;
  const match = String(val).match(/(\d+(\.\d+)?)/);
  return match ? parseFloat(match[1]) : 0;
}

function resumeExtension(filename = '') {
  const parts = String(filename || '').toLowerCase().split('.');
  return parts.length > 1 ? parts.pop() : '';
}

export function validateResumeFile(file) {
  if (!file) {
    const error = new Error('Resume file is required');
    error.status = 400;
    throw error;
  }

  if (file.size > RESUME_UPLOAD_LIMIT_BYTES) {
    const error = new Error(`Resume file must be ${RESUME_UPLOAD_LIMIT_LABEL} or smaller.`);
    error.status = 413;
    throw error;
  }

  const extension = resumeExtension(file.originalname);
  const mimeType = String(file.mimetype || '').toLowerCase();
  if (!ALLOWED_RESUME_EXTENSIONS.has(extension) && !ALLOWED_RESUME_MIME_TYPES.has(mimeType)) {
    const error = new Error('Resume must be a PDF, DOC, DOCX, or TXT file.');
    error.status = 400;
    throw error;
  }
}

function getMissingSchemaColumn(error) {
  const message = error?.message || '';
  const match = message.match(/Could not find the '([^']+)' column of '([^']+)' in the schema cache/i);
  if (!match) return null;

  return {
    column: match[1],
    table: match[2],
  };
}

async function insertCandidateWithSchemaFallback(candidateInsert) {
  const ignoredColumns = new Set();

  while (true) {
    const payload = Object.fromEntries(
      Object.entries(candidateInsert).filter(([key]) => !ignoredColumns.has(key)),
    );

    const result = await supabaseAdmin
      .from('candidates')
      .insert(payload)
      .select('*')
      .single();

    if (!result.error) return result;

    const missingColumn = getMissingSchemaColumn(result.error);
    const shouldRetry = missingColumn
      && missingColumn.table === 'candidates'
      && Object.hasOwn(candidateInsert, missingColumn.column)
      && !ignoredColumns.has(missingColumn.column);

    if (!shouldRetry) return result;

    ignoredColumns.add(missingColumn.column);
    console.warn(
      `Supabase candidates table is missing "${missingColumn.column}". Retrying insert without that column.`,
    );
  }
}

async function tryEnsureCandidateEmbedding(candidate, resume) {
  try {
    await ensureCandidateEmbedding(candidate, resume);
    return { status: 'ready' };
  } catch (error) {
    console.warn('Candidate embedding generation failed:', error?.message || error);
    return { status: 'failed', error: error?.message || 'Candidate embedding generation failed' };
  }
}

function fallbackParsedProfile({ text, file }) {
  const emailMatch = text.match(/[\w.+-]+@[\w.-]+\.[a-zA-Z]{2,}/);
  const phoneMatch = text.match(/(\+?\d[\d -]{9,15}\d)/);
  const locationMatch = text.match(/([A-Z][a-zA-Z ]{1,30},\s*[A-Z][a-zA-Z ]{1,30})/);
  const expMatch = text.match(/(\d+)\s*\+?\s*years?\s+(of\s+)?experience/i);

  return candidateShape({
    full_name: file.originalname.replace(/\.[^.]+$/, ''),
    email: emailMatch ? emailMatch[0] : '',
    phone: phoneMatch ? phoneMatch[0].trim() : '',
    summary: 'Document text successfully extracted, but AI structured parsing was unavailable.',
    current_company: '',
    current_title: 'Applicant',
    years_experience: expMatch ? Number(expMatch[1]) : 0,
    skills: [],
    education: [],
    experience: [],
    location: locationMatch ? locationMatch[0].trim() : '',
  });
}

function withApplicantOverrides(parsed, applicant = {}) {
  const fullName = String(applicant.full_name || applicant.fullName || '').trim();
  const email = String(applicant.email || '').trim().toLowerCase();
  const phone = String(applicant.phone || '').trim();

  return candidateShape({
    ...parsed,
    full_name: fullName || parsed.full_name,
    email: email || parsed.email,
    phone: phone || parsed.phone,
  });
}

export async function processCandidateResumeUpload({ file, ownerId, changedBy = ownerId, applicant = {}, historyNote = '' }) {
  validateResumeFile(file);

  console.log('Extracting text from uploaded file:', file.originalname);
  let text;
  try {
    text = await extractResumeText({
      buffer: file.buffer,
      filename: file.originalname,
      mimeType: file.mimetype,
    });
  } catch (extractErr) {
    console.error('Text extraction failed:', extractErr);
    const error = new Error('Could not extract readable text from this resume.');
    error.status = 422;
    throw error;
  }

  let parsed;
  try {
    parsed = candidateShape(await parseResumeWithGemini(text));
  } catch (geminiError) {
    console.error('Gemini resume parsing failed, falling back to local fallback data:', geminiError);
    parsed = fallbackParsedProfile({ text, file });
  }

  parsed = withApplicantOverrides(parsed, applicant);

  if (!supabaseConfigured) {
    const store = getDemoStore();
    const candidate = {
      id: nextId('candidate'),
      owner_id: ownerId,
      full_name: parsed.full_name || file.originalname.replace(/\.[^.]+$/, ''),
      email: parsed.email || '',
      phone: parsed.phone || '',
      summary: parsed.summary || '',
      current_company: parsed.current_company || '',
      current_title: parsed.current_title || '',
      years_experience: parseYearsExperience(parsed.years_experience || 0),
      skills: normalizeArray(parsed.skills),
      education: normalizeArray(parsed.education),
      experience: normalizeArray(parsed.experience),
      location: parsed.location || '',
      stage: 'parsed',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const resume = {
      id: nextId('resume'),
      candidate_id: candidate.id,
      file_name: file.originalname,
      mime_type: file.mimetype,
      extracted_text: text,
      storage_path: null,
      parse_status: 'parsed',
      created_at: new Date().toISOString(),
    };

    store.candidates.unshift(candidate);
    store.resumes.unshift(resume);
    store.stageHistory.unshift({
      id: nextId('history'),
      candidate_id: candidate.id,
      from_stage: 'new',
      to_stage: 'parsed',
      changed_by: changedBy,
      note: historyNote,
      created_at: new Date().toISOString(),
    });

    const embedding = await tryEnsureCandidateEmbedding(candidate, resume);
    return { candidate, resume, embedding, extractedText: text };
  }

  const candidateInsert = {
    owner_id: ownerId,
    full_name: parsed.full_name || file.originalname.replace(/\.[^.]+$/, ''),
    email: parsed.email || '',
    phone: parsed.phone || '',
    summary: parsed.summary || '',
    current_company: parsed.current_company || '',
    current_title: parsed.current_title || '',
    years_experience: parseYearsExperience(parsed.years_experience || 0),
    skills: normalizeArray(parsed.skills),
    education: normalizeArray(parsed.education),
    experience: normalizeArray(parsed.experience),
    location: parsed.location || '',
    stage: 'parsed',
  };

  console.log('Inserting candidate record into Supabase...');
  const { data: candidate, error: candidateError } = await insertCandidateWithSchemaFallback(candidateInsert);
  if (candidateError) {
    console.error('Candidate insert failed:', candidateError);
    const error = new Error('Candidate insert failed');
    error.status = 500;
    throw error;
  }

  if (!candidate) {
    console.error('Candidate insert returned empty result');
    const error = new Error('Candidate insert returned empty result');
    error.status = 500;
    throw error;
  }

  let storagePath = null;
  try {
    const bucket = process.env.SUPABASE_RESUME_BUCKET || 'resumes';
    const safeName = String(file.originalname || 'resume').replace(/[^a-zA-Z0-9._-]/g, '-');
    const uploadPath = `${candidate.id}/${Date.now()}-${safeName}`;
    console.log(`Uploading file to Supabase Storage in bucket "${bucket}"...`);
    const { error: storageError } = await supabaseAdmin.storage.from(bucket).upload(uploadPath, file.buffer, {
      contentType: file.mimetype,
      upsert: false,
    });
    if (!storageError) {
      storagePath = uploadPath;
    } else {
      console.warn('Supabase storage upload failed:', storageError);
    }
  } catch (err) {
    console.error('Supabase storage upload exception:', err);
  }

  console.log('Inserting resume record into Supabase...');
  const { data: resume, error: resumeError } = await supabaseAdmin
    .from('candidate_resumes')
    .insert({
      candidate_id: candidate.id,
      file_name: file.originalname,
      mime_type: file.mimetype,
      extracted_text: text,
      storage_path: storagePath,
      parse_status: 'parsed',
    })
    .select('*')
    .single();

  if (resumeError) {
    console.error('Resume insert failed:', resumeError);
    const error = new Error('Resume record insert failed');
    error.status = 500;
    throw error;
  }

  try {
    console.log('Logging initial stage transition history...');
    await supabaseAdmin.from('candidate_stage_history').insert({
      candidate_id: candidate.id,
      from_stage: 'new',
      to_stage: 'parsed',
      changed_by: changedBy,
      note: historyNote,
    });
  } catch (err) {
    console.warn('Candidate stage history insert exception (silenced):', err);
  }

  const shapedCandidate = candidateShape(candidate);
  const embedding = await tryEnsureCandidateEmbedding(shapedCandidate, resume);
  console.log('Resume parsed and candidate imported successfully:', candidate.id);
  return { candidate: shapedCandidate, resume, embedding, extractedText: text };
}
