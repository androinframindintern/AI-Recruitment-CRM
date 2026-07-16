import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { getDemoStore } from '../lib/demoStore.js';
import { supabaseAdmin, supabaseConfigured } from '../lib/supabase.js';

const router = Router();

const STAGES = [
  { id: 'new', stage: 'Applied' },
  { id: 'parsed', stage: 'Parsed' },
  { id: 'screened', stage: 'Screened' },
  { id: 'shortlisted', stage: 'Shortlisted' },
  { id: 'interview_scheduled', stage: 'Interview' },
  { id: 'selected', stage: 'Selected' },
  { id: 'hired', stage: 'Hired' },
  { id: 'rejected', stage: 'Rejected' },
];

function normalizeArray(value) {
  if (Array.isArray(value)) return value.filter(Boolean).map((item) => String(item).trim()).filter(Boolean);
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return normalizeArray(parsed);
    } catch {}
    return value.split(/[,\n]/).map((item) => item.trim()).filter(Boolean);
  }
  return [];
}

function dayKey(value) {
  const date = new Date(value || Date.now());
  if (!Number.isFinite(date.getTime())) return dayKey(Date.now());
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

function weekKey(value) {
  const date = new Date(value || Date.now());
  if (!Number.isFinite(date.getTime())) return weekKey(Date.now());
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = start.getUTCDay() || 7;
  start.setUTCDate(start.getUTCDate() - day + 1);
  return dayKey(start);
}

function monthKey(value) {
  const date = new Date(value || Date.now());
  if (!Number.isFinite(date.getTime())) return monthKey(Date.now());
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function increment(map, key, amount = 1) {
  if (!key) return;
  map[key] = (map[key] || 0) + amount;
}

function mapToSeries(map, dateKey = 'date', valueKey = 'count') {
  return Object.entries(map)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => ({ [dateKey]: key, [valueKey]: value }));
}

function average(numbers) {
  const values = numbers.map(Number).filter((value) => Number.isFinite(value));
  if (!values.length) return 0;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function isMissingSchemaError(error) {
  const message = error?.message || '';
  return error?.code === '42P01'
    || error?.code === '42703'
    || error?.code === 'PGRST204'
    || /does not exist|schema cache|Could not find/i.test(message);
}

function optionalResult(result, label) {
  if (!result?.error) return result;
  if (isMissingSchemaError(result.error)) {
    console.warn(`Analytics optional source "${label}" is not available: ${result.error.message}`);
    return { data: [], error: null };
  }
  return result;
}

function analyticsError(res, label, error) {
  console.error(`Analytics ${label} failed:`, error?.message || error);
  return res.status(500).json({
    error: 'Failed to load analytics',
    detail: process.env.NODE_ENV === 'production' ? undefined : error?.message,
  });
}

function summarize(candidates = [], scores = [], interviews = [], jobs = [], emails = [], stageHistory = []) {
  const stageCounts = candidates.reduce((acc, candidate) => {
    increment(acc, candidate.stage || 'new');
    return acc;
  }, {});

  const selectedCount = stageCounts.selected || 0;
  const hiredCount = stageCounts.hired || selectedCount;
  const parsedCount = (stageCounts.parsed || 0) + candidates.filter((candidate) => candidate.stage && candidate.stage !== 'new').length;
  const activeScores = scores.map((item) => Number(item.score || 0)).filter((score) => Number.isFinite(score));
  const averageScore = average(activeScores);
  const highScoreCandidates = [...new Set(scores.filter((item) => Number(item.score || 0) >= 80).map((item) => item.candidate_id).filter(Boolean))];

  const funnelBase = Math.max(candidates.length, 1);
  const funnel = STAGES.map((stage, index) => {
    const rawCount = stage.id === 'screened'
      ? Math.max(stageCounts.parsed || 0, scores.length)
      : stage.id === 'hired'
        ? hiredCount
        : stageCounts[stage.id] || 0;
    const previous = index > 0 ? STAGES[index - 1] : null;
    const previousCount = previous
      ? previous.id === 'screened'
        ? Math.max(stageCounts.parsed || 0, scores.length)
        : previous.id === 'hired'
          ? hiredCount
          : stageCounts[previous.id] || 0
      : rawCount;
    return {
      id: stage.id,
      stage: stage.stage,
      count: rawCount,
      conversionRate: previousCount ? Math.round((rawCount / previousCount) * 100) : 0,
      overallRate: Math.round((rawCount / funnelBase) * 100),
    };
  });

  const dailyApplicationsMap = {};
  const weeklyHiringMap = {};
  const monthlyHiringMap = {};
  for (const candidate of candidates) {
    increment(dailyApplicationsMap, dayKey(candidate.created_at));
    if (candidate.stage === 'selected' || candidate.stage === 'hired') {
      increment(weeklyHiringMap, weekKey(candidate.updated_at || candidate.created_at));
      increment(monthlyHiringMap, monthKey(candidate.updated_at || candidate.created_at));
    }
  }

  const topSkillMap = {};
  for (const candidate of candidates) {
    for (const skill of normalizeArray(candidate.skills)) increment(topSkillMap, skill.toLowerCase());
  }
  const topSkills = Object.entries(topSkillMap)
    .map(([skill, count]) => ({ skill: skill.replace(/\b\w/g, (char) => char.toUpperCase()), count }))
    .sort((a, b) => b.count - a.count || a.skill.localeCompare(b.skill))
    .slice(0, 10);

  const jobsById = new Map(jobs.map((job) => [job.id, job]));
  const jobScoreMap = new Map();
  for (const score of scores) {
    if (!score.job_id) continue;
    const current = jobScoreMap.get(score.job_id) || { jobId: score.job_id, title: jobsById.get(score.job_id)?.title || 'Unlinked Job', candidateIds: new Set(), scores: [] };
    if (score.candidate_id) current.candidateIds.add(score.candidate_id);
    current.scores.push(Number(score.score || 0));
    jobScoreMap.set(score.job_id, current);
  }
  const candidatesByJob = [...jobScoreMap.values()]
    .map((item) => ({ jobId: item.jobId, title: item.title, count: item.candidateIds.size, averageScore: average(item.scores) }))
    .sort((a, b) => b.count - a.count || b.averageScore - a.averageScore)
    .slice(0, 8);

  const experienceBuckets = [
    { label: '0-2 yrs', min: 0, max: 2, count: 0 },
    { label: '3-5 yrs', min: 3, max: 5, count: 0 },
    { label: '6-10 yrs', min: 6, max: 10, count: 0 },
    { label: '10+ yrs', min: 11, max: Infinity, count: 0 },
  ];
  for (const candidate of candidates) {
    const years = Number(candidate.years_experience || 0);
    const bucket = experienceBuckets.find((item) => years >= item.min && years <= item.max) || experienceBuckets[0];
    bucket.count += 1;
  }
  const experienceBreakdown = experienceBuckets.map(({ label, count }) => ({ label, count }));

  const emailByTypeMap = {};
  const emailByStatusMap = {};
  const emailTrendMap = {};
  for (const email of emails) {
    increment(emailByTypeMap, email.type || 'custom');
    increment(emailByStatusMap, email.status || 'sent');
    const key = dayKey(email.sent_at || email.created_at);
    if (!emailTrendMap[key]) emailTrendMap[key] = { date: key, sent: 0, failed: 0, demo: 0, total: 0 };
    const status = email.status || 'sent';
    emailTrendMap[key][status] = (emailTrendMap[key][status] || 0) + 1;
    emailTrendMap[key].total += 1;
  }

  const recentActivity = [
    ...candidates.map((candidate) => ({
      id: `candidate-${candidate.id}`,
      type: 'candidate',
      label: `${candidate.full_name || candidate.email || 'Candidate'} added`,
      created_at: candidate.created_at,
    })),
    ...stageHistory.map((entry) => ({
      id: `stage-${entry.id}`,
      type: 'stage',
      label: `Stage changed to ${entry.to_stage || 'updated'}`,
      created_at: entry.created_at,
    })),
    ...interviews.map((interview) => ({
      id: `interview-${interview.id}`,
      type: 'interview',
      label: interview.title || 'Interview scheduled',
      created_at: interview.created_at || interview.start_at,
    })),
    ...emails.map((email) => ({
      id: `email-${email.id}`,
      type: 'email',
      label: `${email.type || 'Email'} email ${email.status || 'sent'}`,
      created_at: email.created_at || email.sent_at,
    })),
  ].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)).slice(0, 10);

  const sentEmails = emails.filter((item) => item.status === 'sent' || item.status === 'demo').length;
  const failedEmails = emails.filter((item) => item.status === 'failed').length;

  return {
    totals: {
      candidates: candidates.length,
      parsed: parsedCount,
      shortlisted: stageCounts.shortlisted || 0,
      interviewScheduled: stageCounts.interview_scheduled || 0,
      interviews: interviews.length,
      interviewCount: interviews.length,
      selected: selectedCount,
      hired: hiredCount,
      offerAccepted: hiredCount,
      rejected: stageCounts.rejected || 0,
      averageScore,
      highScoreCandidates: highScoreCandidates.length,
      emails: emails.length,
      emailsSent: sentEmails,
      emailsFailed: failedEmails,
      emailSuccessRate: emails.length ? Math.round((sentEmails / emails.length) * 100) : 0,
    },
    funnel,
    candidatesByStage: funnel.filter((item) => item.id !== 'hired'),
    scoreDistribution: [
      { label: '0-40', count: activeScores.filter((score) => score < 40).length },
      { label: '40-60', count: activeScores.filter((score) => score >= 40 && score < 60).length },
      { label: '60-80', count: activeScores.filter((score) => score >= 60 && score < 80).length },
      { label: '80-100', count: activeScores.filter((score) => score >= 80).length },
    ],
    weeklyTrend: mapToSeries(dailyApplicationsMap),
    dailyApplications: mapToSeries(dailyApplicationsMap),
    weeklyHiring: mapToSeries(weeklyHiringMap, 'week', 'count'),
    monthlyHiring: mapToSeries(monthlyHiringMap, 'month', 'count'),
    topSkills,
    candidatesByJob,
    experienceBreakdown,
    highScoreCandidates: candidates
      .filter((candidate) => highScoreCandidates.includes(candidate.id))
      .map((candidate) => ({ id: candidate.id, name: candidate.full_name || candidate.email || 'Candidate', stage: candidate.stage }))
      .slice(0, 8),
    emailByType: Object.entries(emailByTypeMap).map(([type, count]) => ({ type, label: type.replace(/_/g, ' '), count })),
    emailByStatus: Object.entries(emailByStatusMap).map(([status, count]) => ({ status, label: status, count })),
    emailTrend: Object.values(emailTrendMap).sort((a, b) => a.date.localeCompare(b.date)),
    recentActivity,
  };
}

router.get('/summary', requireAuth, async (req, res) => {
  if (!supabaseConfigured) {
    const store = getDemoStore();
    return res.json(summarize(store.candidates, store.scores, store.interviews, store.jobs, store.emails, store.stageHistory));
  }

  let candidatesQuery = supabaseAdmin
    .from('candidates')
    .select('id, owner_id, full_name, email, stage, created_at, updated_at, years_experience, skills')
    .order('created_at', { ascending: false });

  if (req.profile?.role !== 'admin') candidatesQuery = candidatesQuery.eq('owner_id', req.user.id);
  let candidatesRes = await candidatesQuery;
  if (candidatesRes.error && isMissingSchemaError(candidatesRes.error)) {
    console.warn(`Analytics candidates detailed query unavailable: ${candidatesRes.error.message}. Retrying with full row select.`);
    let fallbackQuery = supabaseAdmin.from('candidates').select('*').order('created_at', { ascending: false });
    if (req.profile?.role !== 'admin') fallbackQuery = fallbackQuery.eq('owner_id', req.user.id);
    candidatesRes = await fallbackQuery;
  }
  if (candidatesRes.error) return analyticsError(res, 'candidates query', candidatesRes.error);

  const candidates = candidatesRes.data || [];
  const candidateIds = candidates.map((candidate) => candidate.id);

  let jobsQuery = supabaseAdmin.from('jobs').select('id, owner_id, title, is_active, created_at');
  if (req.profile?.role !== 'admin') jobsQuery = jobsQuery.eq('owner_id', req.user.id);

  const empty = { data: [], error: null };
  const rawResults = await Promise.all([
    candidateIds.length ? supabaseAdmin.from('candidate_job_scores').select('id, candidate_id, job_id, score, skill_match_percent, created_at').in('candidate_id', candidateIds) : empty,
    candidateIds.length ? supabaseAdmin.from('interviews').select('id, candidate_id, job_id, title, status, start_at, created_at').in('candidate_id', candidateIds) : empty,
    jobsQuery,
    candidateIds.length ? supabaseAdmin.from('email_logs').select('*').in('candidate_id', candidateIds) : empty,
    candidateIds.length ? supabaseAdmin.from('candidate_stage_history').select('id, candidate_id, from_stage, to_stage, created_at').in('candidate_id', candidateIds) : empty,
  ]);

  const [scoresRes, interviewsRes, jobsRes, emailsRes, historyRes] = [
    optionalResult(rawResults[0], 'candidate_job_scores'),
    optionalResult(rawResults[1], 'interviews'),
    optionalResult(rawResults[2], 'jobs'),
    optionalResult(rawResults[3], 'email_logs'),
    optionalResult(rawResults[4], 'candidate_stage_history'),
  ];

  const blockingError = scoresRes.error || interviewsRes.error || jobsRes.error || emailsRes.error || historyRes.error;
  if (blockingError) return analyticsError(res, 'optional sources query', blockingError);

  res.json(summarize(
    candidates,
    scoresRes.data || [],
    interviewsRes.data || [],
    jobsRes.data || [],
    emailsRes.data || [],
    historyRes.data || [],
  ));
});

export default router;
