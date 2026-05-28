const now = new Date().toISOString();

const demoStore = {
  profiles: [
    {
      id: 'demo-user',
      email: 'demo@recruitcrm.local',
      full_name: 'Demo Recruiter',
      role: 'recruiter',
      created_at: now,
    },
  ],
  pipelineStages: [
    { id: 'new', name: 'New', position: 1 },
    { id: 'parsed', name: 'Parsed', position: 2 },
    { id: 'shortlisted', name: 'Shortlisted', position: 3 },
    { id: 'interview_scheduled', name: 'Interview Scheduled', position: 4 },
    { id: 'selected', name: 'Selected', position: 5 },
    { id: 'rejected', name: 'Rejected', position: 6 },
  ],
  candidates: [],
  resumes: [],
  jobs: [],
  scores: [],
  notes: [],
  interviews: [],
  emails: [],
  stageHistory: [],
};

let sequence = 1;

export function nextId(prefix) {
  sequence += 1;
  return `${prefix}-${sequence}`;
}

export function getDemoStore() {
  return demoStore;
}
