function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9+.# ]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

function unique(array) {
  return Array.from(new Set(array));
}

export function buildCandidateVector(candidate) {
  const parts = [
    candidate.full_name,
    candidate.summary,
    candidate.current_company,
    candidate.current_title,
    Array.isArray(candidate.skills) ? candidate.skills.join(' ') : '',
    Array.isArray(candidate.experience) ? candidate.experience.map((item) => `${item.title || ''} ${item.company || ''} ${(item.highlights || []).join(' ')}`).join(' ') : '',
  ];
  return unique(tokenize(parts.join(' ')));
}

export function scoreSimilarity(candidate, job) {
  const candidateTokens = new Set(buildCandidateVector(candidate));
  const jobTokens = unique(tokenize(`${job.title || ''} ${job.description || ''}`));
  if (!jobTokens.length) return { score: 0, matchedSkills: [] };

  const matchedSkills = jobTokens.filter((token) => candidateTokens.has(token));
  return {
    score: Math.round((matchedSkills.length / jobTokens.length) * 100),
    matchedSkills,
  };
}
