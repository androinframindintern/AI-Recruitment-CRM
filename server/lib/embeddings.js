import { createHash } from 'node:crypto';
import { generateEmbedding } from './gemini.js';
import { supabaseAdmin, supabaseConfigured } from './supabase.js';

export const EMBEDDING_PROVIDER = 'gemini';
export const EMBEDDING_MODEL = 'text-embedding-004';
export const EMBEDDING_DIMENSIONS = 768;

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function cleanText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function formatList(label, items) {
  const values = normalizeArray(items).map(cleanText).filter(Boolean);
  return values.length ? `${label}:\n- ${values.join('\n- ')}` : '';
}

function formatExperience(experience) {
  return normalizeArray(experience)
    .map((item) => cleanText([
      item?.title,
      item?.company,
      item?.start_date,
      item?.end_date,
      normalizeArray(item?.highlights).join(' '),
    ].filter(Boolean).join(' ')))
    .filter(Boolean)
    .join('\n');
}

function formatEducation(education) {
  return normalizeArray(education)
    .map((item) => cleanText([item?.degree, item?.institution, item?.year].filter(Boolean).join(' ')))
    .filter(Boolean)
    .join('\n');
}

export function buildJobEmbeddingText(job) {
  return [
    `Job Title: ${cleanText(job?.title)}`,
    `Department: ${cleanText(job?.department)}`,
    `Location: ${cleanText(job?.location)}`,
    `Type: ${cleanText(job?.job_type)}`,
    `Description: ${cleanText(job?.description)}`,
    formatList('Requirements', job?.requirements),
  ].filter((part) => cleanText(part)).join('\n\n').slice(0, 12000);
}

export function buildCandidateEmbeddingText(candidate, resume = null) {
  return [
    `Candidate Name: ${cleanText(candidate?.full_name)}`,
    `Current Title: ${cleanText(candidate?.current_title)}`,
    `Current Company: ${cleanText(candidate?.current_company)}`,
    `Location: ${cleanText(candidate?.location)}`,
    `Years Experience: ${cleanText(candidate?.years_experience)}`,
    `Summary: ${cleanText(candidate?.summary)}`,
    formatList('Skills', candidate?.skills),
    formatEducation(candidate?.education) ? `Education:\n${formatEducation(candidate?.education)}` : '',
    formatExperience(candidate?.experience) ? `Experience:\n${formatExperience(candidate?.experience)}` : '',
    `Extracted Resume Text: ${cleanText(resume?.extracted_text).slice(0, 9000)}`,
  ].filter((part) => cleanText(part)).join('\n\n').slice(0, 12000);
}

export function hashEmbeddingText(text) {
  return createHash('sha256').update(String(text || '')).digest('hex');
}

export function validateEmbeddingVector(vector) {
  const valid = Array.isArray(vector)
    && vector.length === EMBEDDING_DIMENSIONS
    && vector.every((value) => Number.isFinite(Number(value)));
  if (!valid) {
    throw new Error(`Invalid embedding vector. Expected ${EMBEDDING_DIMENSIONS} numeric values.`);
  }
  return vector.map(Number);
}

export function cosineSimilarity(vecA, vecB) {
  if (!Array.isArray(vecA) || !Array.isArray(vecB) || vecA.length !== vecB.length) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i += 1) {
    const a = Number(vecA[i]);
    const b = Number(vecB[i]);
    dotProduct += a * b;
    normA += a * a;
    normB += b * b;
  }
  if (!normA || !normB) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

function toPgVector(vector) {
  return `[${vector.map((value) => Number(value).toFixed(8)).join(',')}]`;
}

function vectorPayload({ entityColumn, entityId, text, vector }) {
  return {
    [entityColumn]: entityId,
    provider: EMBEDDING_PROVIDER,
    model: EMBEDDING_MODEL,
    dimensions: EMBEDDING_DIMENSIONS,
    content_hash: hashEmbeddingText(text),
    embedding: vector,
    embedding_vector: toPgVector(vector),
  };
}

function isMissingEmbeddingColumnError(error) {
  return /embedding_vector|model|dimensions|content_hash|updated_at/i.test(error?.message || '');
}

function isMissingConflictConstraintError(error) {
  return /no unique or exclusion constraint matching the on conflict specification/i.test(error?.message || '');
}

function toLegacyEmbeddingPayload(payload) {
  const legacyPayload = { ...payload };
  delete legacyPayload.embedding_vector;
  delete legacyPayload.model;
  delete legacyPayload.dimensions;
  delete legacyPayload.content_hash;
  delete legacyPayload.updated_at;
  return legacyPayload;
}

async function manualUpsertEmbedding(table, payload) {
  const entityColumn = payload.job_id ? 'job_id' : 'candidate_id';
  const { data: existingEmbedding, error: selectError } = await supabaseAdmin
    .from(table)
    .select('id')
    .eq(entityColumn, payload[entityColumn])
    .eq('provider', payload.provider)
    .maybeSingle();

  if (selectError) return { data: null, error: selectError };

  if (existingEmbedding) {
    return supabaseAdmin
      .from(table)
      .update(payload)
      .eq('id', existingEmbedding.id)
      .select('*')
      .single();
  }

  return supabaseAdmin
    .from(table)
    .insert(payload)
    .select('*')
    .single();
}

async function upsertEmbedding(table, payload, onConflict) {
  let activePayload = payload;
  let result = await supabaseAdmin
    .from(table)
    .upsert(activePayload, { onConflict })
    .select('*')
    .single();

  if (result.error && (isMissingEmbeddingColumnError(result.error) || isMissingConflictConstraintError(result.error))) {
    activePayload = toLegacyEmbeddingPayload(payload);
    result = await supabaseAdmin
      .from(table)
      .upsert(activePayload, { onConflict: onConflict.split(',').slice(0, 2).join(',') })
      .select('*')
      .single();
  }

  if (result.error && isMissingConflictConstraintError(result.error)) {
    result = await manualUpsertEmbedding(table, activePayload);
    if (result.error && isMissingEmbeddingColumnError(result.error)) {
      result = await manualUpsertEmbedding(table, toLegacyEmbeddingPayload(activePayload));
    }
  }

  return result;
}

export async function ensureJobEmbedding(job) {
  const text = buildJobEmbeddingText(job);
  const contentHash = hashEmbeddingText(text);

  if (!text) throw new Error('Job text is empty; cannot generate job embedding.');

  if (supabaseConfigured && job?.id) {
    const { data: existing } = await supabaseAdmin
      .from('job_embeddings')
      .select('id, content_hash, embedding')
      .eq('job_id', job.id)
      .eq('provider', EMBEDDING_PROVIDER)
      .eq('model', EMBEDDING_MODEL)
      .maybeSingle();

    if (existing?.content_hash === contentHash && existing?.embedding?.length === EMBEDDING_DIMENSIONS) {
      return { embedding: validateEmbeddingVector(existing.embedding), contentHash, reused: true };
    }
  }

  const embedding = validateEmbeddingVector(await generateEmbedding(text));

  if (supabaseConfigured && job?.id) {
    const payload = vectorPayload({ entityColumn: 'job_id', entityId: job.id, text, vector: embedding });
    const { error } = await upsertEmbedding('job_embeddings', payload, 'job_id,provider,model');
    if (error) throw error;
  }

  return { embedding, contentHash, reused: false };
}

export async function ensureCandidateEmbedding(candidate, resume = null) {
  const text = buildCandidateEmbeddingText(candidate, resume);
  const contentHash = hashEmbeddingText(text);

  if (!text) throw new Error('Candidate text is empty; cannot generate candidate embedding.');

  if (supabaseConfigured && candidate?.id) {
    const { data: existing } = await supabaseAdmin
      .from('candidate_embeddings')
      .select('id, content_hash, embedding')
      .eq('candidate_id', candidate.id)
      .eq('provider', EMBEDDING_PROVIDER)
      .eq('model', EMBEDDING_MODEL)
      .maybeSingle();

    if (existing?.content_hash === contentHash && existing?.embedding?.length === EMBEDDING_DIMENSIONS) {
      return { embedding: validateEmbeddingVector(existing.embedding), contentHash, reused: true };
    }
  }

  const embedding = validateEmbeddingVector(await generateEmbedding(text));

  if (supabaseConfigured && candidate?.id) {
    const payload = vectorPayload({ entityColumn: 'candidate_id', entityId: candidate.id, text, vector: embedding });
    const { error } = await upsertEmbedding('candidate_embeddings', payload, 'candidate_id,provider,model');
    if (error) throw error;
  }

  return { embedding, contentHash, reused: false };
}
