import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { getDemoStore } from '../lib/demoStore.js';
import { supabaseAdmin, supabaseConfigured } from '../lib/supabase.js';

const router = Router();

function summarize(candidates, scores, interviews) {
  const stageCounts = candidates.reduce((acc, candidate) => {
    acc[candidate.stage] = (acc[candidate.stage] || 0) + 1;
    return acc;
  }, {});

  const totalScore = scores.reduce((sum, item) => sum + Number(item.score || 0), 0);
  const averageScore = scores.length ? Math.round(totalScore / scores.length) : 0;

  const weekly = candidates.reduce((acc, candidate) => {
    const date = new Date(candidate.created_at);
    const key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  return {
    totals: {
      candidates: candidates.length,
      shortlisted: stageCounts.shortlisted || 0,
      interviews: interviews.length,
      selected: stageCounts.selected || 0,
      rejected: stageCounts.rejected || 0,
      averageScore,
    },
    funnel: [
      { stage: 'New', count: stageCounts.new || 0 },
      { stage: 'Parsed', count: stageCounts.parsed || 0 },
      { stage: 'Shortlisted', count: stageCounts.shortlisted || 0 },
      { stage: 'Interview Scheduled', count: stageCounts.interview_scheduled || 0 },
      { stage: 'Selected', count: stageCounts.selected || 0 },
      { stage: 'Rejected', count: stageCounts.rejected || 0 },
    ],
    scoreDistribution: [
      { label: '0-40', count: scores.filter((item) => item.score < 40).length },
      { label: '40-60', count: scores.filter((item) => item.score >= 40 && item.score < 60).length },
      { label: '60-80', count: scores.filter((item) => item.score >= 60 && item.score < 80).length },
      { label: '80-100', count: scores.filter((item) => item.score >= 80).length },
    ],
    weeklyTrend: Object.entries(weekly)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, count]) => ({ date, count })),
  };
}

router.get('/summary', requireAuth, async (_req, res) => {
  if (!supabaseConfigured) {
    const store = getDemoStore();
    return res.json(summarize(store.candidates, store.scores, store.interviews));
  }

  const [candidatesRes, scoresRes, interviewsRes] = await Promise.all([
    supabaseAdmin.from('candidates').select('id, stage, created_at'),
    supabaseAdmin.from('candidate_job_scores').select('score'),
    supabaseAdmin.from('interviews').select('id'),
  ]);

  if (candidatesRes.error || scoresRes.error || interviewsRes.error) {
    return res.status(500).json({ error: 'Failed to load analytics' });
  }

  res.json(summarize(candidatesRes.data || [], scoresRes.data || [], interviewsRes.data || []));
});

export default router;
