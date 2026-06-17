'use client';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPatch, apiPostForm } from '@/lib/api';
import AppShell from '../_components/AppShell';
import EmptyState from '../_components/EmptyState';
import { PrimaryButton, SecondaryButton } from '../_components/PrimaryButton';
import SectionCard from '../_components/SectionCard';

const STAGES = [
  { id: 'new', label: 'New', color: '#6366f1', badgeCls: 'badge-indigo' },
  { id: 'parsed', label: 'Parsed', color: '#06b6d4', badgeCls: 'badge-sky' },
  { id: 'shortlisted', label: 'Shortlisted', color: '#f59e0b', badgeCls: 'badge-amber' },
  { id: 'interview_scheduled', label: 'Interview', color: '#8b5cf6', badgeCls: 'badge-violet' },
  { id: 'selected', label: 'Selected', color: '#10b981', badgeCls: 'badge-emerald' },
  { id: 'rejected', label: 'Rejected', color: '#f43f5e', badgeCls: 'badge-rose' },
];

export default function CandidatesPage() {
  const queryClient = useQueryClient();
  const [resumeFile, setResumeFile] = useState(null);
  const [notice, setNotice] = useState('');
  const [search, setSearch] = useState('');
  const [minExperience, setMinExperience] = useState('');
  const [selectedSkill, setSelectedSkill] = useState('');
  const [draggedOverStage, setDraggedOverStage] = useState(null);
  const [isDragging, setIsDragging] = useState(null);

  const candidatesQuery = useQuery({
    queryKey: ['candidates'],
    queryFn: () => apiGet('/api/candidates', { auth: true }),
  });

  const uploadMutation = useMutation({
    mutationFn: async () => {
      const formData = new FormData();
      formData.append('resume', resumeFile);
      return apiPostForm('/api/candidates/upload', formData, { auth: true });
    },
    onSuccess: () => {
      setResumeFile(null);
      setNotice('Resume uploaded and parsed successfully.');
      queryClient.invalidateQueries({ queryKey: ['candidates'] });
      queryClient.invalidateQueries({ queryKey: ['analytics-summary'] });
    },
    onError: (error) => setNotice(error.message || 'Resume upload failed'),
  });

  const stageMutation = useMutation({
    mutationFn: ({ candidateId, stage }) => apiPatch(`/api/candidates/${candidateId}/stage`, { stage }, { auth: true }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['candidates'] });
      queryClient.invalidateQueries({ queryKey: ['analytics-summary'] });
    },
  });

  const getCandidateSkills = (candidate) => {
    if (!candidate || !candidate.skills) return [];
    const rawSkills = Array.isArray(candidate.skills) ? candidate.skills : [];
    return rawSkills
      .map(s => {
        if (typeof s === 'string') return s.trim();
        if (s && typeof s === 'object' && s.name) return String(s.name).trim();
        return s ? String(s).trim() : '';
      })
      .filter(Boolean);
  };

  const getCandidateExperience = (candidate) => {
    if (!candidate) return 0;
    const val = candidate.years_experience;
    if (typeof val === 'number') return val;
    if (!val) return 0;
    const match = String(val).match(/(\d+(\.\d+)?)/);
    return match ? parseFloat(match[1]) : 0;
  };

  const filteredCandidates = useMemo(() => {
    const candidates = candidatesQuery.data?.candidates || [];
    let result = candidates;

    const term = search.trim().toLowerCase();
    if (term) {
      result = result.filter((candidate) => {
        const skills = getCandidateSkills(candidate);
        const haystack = `${candidate.full_name || ''} ${candidate.email || ''} ${candidate.current_title || ''} ${candidate.current_company || ''} ${skills.join(' ')}`.toLowerCase();
        return haystack.includes(term);
      });
    }

    if (minExperience) {
      const minYears = Number(minExperience);
      result = result.filter((candidate) => getCandidateExperience(candidate) >= minYears);
    }

    if (selectedSkill) {
      const skillToFind = selectedSkill.toLowerCase();
      result = result.filter((candidate) => {
        const skills = getCandidateSkills(candidate);
        return skills.some(s => s.toLowerCase() === skillToFind);
      });
    }

    return result;
  }, [candidatesQuery.data?.candidates, search, minExperience, selectedSkill]);

  const allUniqueSkills = useMemo(() => {
    const candidates = candidatesQuery.data?.candidates || [];
    const skillsSet = new Set();
    candidates.forEach((candidate) => {
      const skills = getCandidateSkills(candidate);
      skills.forEach((skill) => {
        skillsSet.add(skill);
      });
    });
    return Array.from(skillsSet).sort();
  }, [candidatesQuery.data?.candidates]);

  const grouped = STAGES.map((stage) => ({
    ...stage,
    candidates: filteredCandidates.filter((candidate) => candidate.stage === stage.id),
  }));

  function handleFileChange(event) {
    const file = event.target.files?.[0] || null;
    setResumeFile(file);
    setNotice('');
  }

  // Drag and drop handlers
  function handleDragStart(event, candidateId) {
    event.dataTransfer.setData('text/plain', candidateId);
    setIsDragging(candidateId);
  }

  function handleDragEnd() {
    setIsDragging(null);
    setDraggedOverStage(null);
  }

  function handleDragOver(event, stageId) {
    event.preventDefault();
    if (draggedOverStage !== stageId) {
      setDraggedOverStage(stageId);
    }
  }

  function handleDragLeave(event) {
    const related = event.relatedTarget;
    if (related && event.currentTarget.contains(related)) {
      return;
    }
    setDraggedOverStage(null);
  }

  function handleDrop(event, stageId) {
    event.preventDefault();
    const candidateId = event.dataTransfer.getData('text/plain');
    if (candidateId) {
      stageMutation.mutate({ candidateId, stage: stageId });
    }
    setDraggedOverStage(null);
    setIsDragging(null);
  }

  return (
    <AppShell>
      {/* Page Header */}
      <div className="mb-8 animate-fade-in">
        <h1 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
          Candidates Board
        </h1>
        <p className="mt-2 text-sm text-[#8b95b0]">
          Manage resumes, check AI scores, and move candidates through the ATS stages.
        </p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.75fr_1.25fr] items-start animate-fade-in">
        {/* Left Side: Upload & Search Panel */}
        <div className="space-y-6">
          <SectionCard 
            title="Upload Resume" 
            description="Upload PDF or DOCX format resumes. AI extracts key details automatically."
          >
            <div className="rounded-2xl border-2 border-dashed border-white/10 bg-white/[0.015] hover:bg-white/[0.03] hover:border-indigo-500/30 transition-all p-6 text-center relative group">
              <input 
                type="file" 
                accept=".pdf,.doc,.docx" 
                onChange={handleFileChange} 
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
              />
              <div className="flex flex-col items-center justify-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-white/[0.03] border border-white/10 flex items-center justify-center group-hover:bg-indigo-500/10 group-hover:border-indigo-500/20 transition-all">
                  <svg className="w-6 h-6 text-indigo-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">Select a candidate resume</p>
                  <p className="text-xs text-[#8b95b0] mt-1">Accepts PDF, DOCX or DOC up to 10MB</p>
                </div>
              </div>
            </div>

            {resumeFile && (
              <div className="mt-4 rounded-xl border border-indigo-500/20 bg-indigo-500/5 p-4 flex items-center justify-between gap-4">
                <div className="flex items-center gap-2.5 min-w-0">
                  <svg className="w-5 h-5 text-indigo-400 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <span className="text-xs text-white truncate font-medium">{resumeFile.name}</span>
                </div>
                <button 
                  type="button" 
                  onClick={() => setResumeFile(null)}
                  className="text-xs text-slate-500 hover:text-white"
                >
                  Clear
                </button>
              </div>
            )}

            {resumeFile && (
              <div className="mt-4">
                <PrimaryButton 
                  type="button" 
                  disabled={uploadMutation.isPending} 
                  onClick={() => uploadMutation.mutate()}
                  className="w-full justify-center"
                >
                  {uploadMutation.isPending ? 'Parsing Resume…' : 'Upload & Parse Resume'}
                </PrimaryButton>
              </div>
            )}

            {notice && (
              <div className="mt-4 p-4 rounded-xl border border-white/10 bg-white/[0.03] text-xs text-slate-300 flex gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 mt-1 flex-shrink-0" />
                <p>{notice}</p>
              </div>
            )}
          </SectionCard>

          <SectionCard 
            title="Filter Candidates" 
            description="Quick search and filters over roles, skills, and experience levels."
          >
            <div className="space-y-4">
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                  <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </span>
                <input 
                  value={search} 
                  onChange={(event) => setSearch(event.target.value)} 
                  placeholder="Search candidates..." 
                  className="w-full rounded-xl border border-white/10 bg-white/5 pl-10 pr-4 py-3 text-sm text-white placeholder:text-slate-500 focus:border-indigo-500/50 focus:shadow-md focus:bg-white/[0.07] transition-all"
                />
              </div>

              <div>
                <label className="form-label mb-1.5 block">Minimum Experience</label>
                <select
                  value={minExperience}
                  onChange={(e) => setMinExperience(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white focus:border-indigo-500/50 focus:bg-[#080d1a] transition-all"
                >
                  <option value="" className="bg-slate-900">Any Experience</option>
                  <option value="1" className="bg-slate-900">1+ Years</option>
                  <option value="3" className="bg-slate-900">3+ Years</option>
                  <option value="5" className="bg-slate-900">5+ Years</option>
                  <option value="8" className="bg-slate-900">8+ Years</option>
                  <option value="10" className="bg-slate-900">10+ Years</option>
                </select>
              </div>

              <div>
                <label className="form-label mb-1.5 block">Skill Filter</label>
                <select
                  value={selectedSkill}
                  onChange={(e) => setSelectedSkill(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white focus:border-indigo-500/50 focus:bg-[#080d1a] transition-all"
                >
                  <option value="" className="bg-slate-900">All Skills</option>
                  {allUniqueSkills.map((skill) => (
                    <option key={skill} value={skill} className="bg-slate-900">
                      {skill}
                    </option>
                  ))}
                </select>
              </div>

              {(search || minExperience || selectedSkill) && (
                <button
                  type="button"
                  onClick={() => {
                    setSearch('');
                    setMinExperience('');
                    setSelectedSkill('');
                  }}
                  className="w-full btn btn-ghost btn-sm font-semibold text-indigo-400 hover:text-indigo-300"
                >
                  Clear Active Filters
                </button>
              )}
            </div>
          </SectionCard>
        </div>

        {/* Right Side: Kanban Board */}
        <SectionCard 
          title="ATS Pipeline Board" 
          description="Drag cards to change stages or update stage using card dropdown selectors."
          className="min-w-0 w-full"
        >
          {filteredCandidates.length ? (
            /* Kanban Horizontal Container */
            <div className="flex gap-4 overflow-x-auto pb-4 scroll-smooth min-h-[500px] w-full">
              {grouped.map((stage) => (
                <div 
                  key={stage.id} 
                  className="w-72 flex-shrink-0 flex flex-col rounded-2xl bg-white/[0.012] border border-white/5 p-4"
                  style={{ borderTop: `3px solid ${stage.color}` }}
                >
                  {/* Column Header */}
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <span 
                        className="w-2.5 h-2.5 rounded-full" 
                        style={{ backgroundColor: stage.color }}
                      />
                      <h3 className="text-sm font-bold text-white tracking-wide">{stage.label}</h3>
                    </div>
                    <span className="rounded-full bg-white/5 px-2.5 py-0.5 text-xs text-slate-400 font-medium">
                      {stage.candidates.length}
                    </span>
                  </div>

                  {/* Column Cards Container */}
                  <div 
                    className={`flex-1 space-y-3 overflow-y-auto pr-1 transition-all duration-200 rounded-xl p-1 ${draggedOverStage === stage.id ? 'bg-indigo-500/5 border border-dashed border-indigo-500/20 shadow-inner' : ''}`}
                    onDragOver={(event) => handleDragOver(event, stage.id)}
                    onDragLeave={handleDragLeave}
                    onDrop={(event) => handleDrop(event, stage.id)}
                  >
                    {stage.candidates.length ? (
                      stage.candidates.map((candidate) => {
                        const score = candidate.latest_score?.score;
                        return (
                          <div 
                            key={candidate.id} 
                            draggable
                            onDragStart={(event) => handleDragStart(event, candidate.id)}
                            onDragEnd={handleDragEnd}
                            className={`rounded-xl border border-white/5 bg-[#080d1a]/50 p-4 transition-all hover:bg-white/[0.03] hover:border-white/15 cursor-grab active:cursor-grabbing ${isDragging === candidate.id ? 'opacity-40 scale-95' : ''}`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <h4 className="text-sm font-bold text-white truncate">{candidate.full_name}</h4>
                                <p className="mt-1 text-xs text-slate-400 truncate">
                                  {candidate.current_title || 'Candidate'}
                                  {candidate.current_company && ` · ${candidate.current_company}`}
                                </p>
                              </div>
                              {score ? (
                                <span className="text-xs font-bold text-cyan-300 bg-cyan-500/10 px-2 py-0.5 rounded border border-cyan-400/20">
                                  {score}%
                                </span>
                              ) : (
                                <span className="text-xs text-slate-600">—</span>
                              )}
                            </div>

                            {/* Skills Tagline */}
                            <div className="mt-3 flex flex-wrap gap-1">
                              {(candidate.skills || []).slice(0, 3).map((skill) => (
                                <span 
                                  key={skill} 
                                  className="rounded px-2 py-0.5 text-[10px] font-semibold bg-white/5 border border-white/5 text-[#8b95b0]"
                                >
                                  {skill}
                                </span>
                              ))}
                            </div>

                            {/* Card CTA & Selector */}
                            <div className="mt-4 flex items-center justify-between gap-2 border-t border-white/5 pt-3">
                              <Link 
                                href={`/candidates/${candidate.id}`} 
                                className="btn btn-secondary btn-xs font-semibold px-3 py-1.5"
                              >
                                Open Profile
                              </Link>
                              
                              <select
                                value={candidate.stage}
                                onChange={(event) => stageMutation.mutate({ candidateId: candidate.id, stage: event.target.value })}
                                className="rounded-lg border border-white/10 bg-[#080d1a] px-2 py-1 text-xs text-slate-300 focus:border-indigo-500/50"
                              >
                                {STAGES.map((option) => (
                                  <option key={option.id} value={option.id} className="bg-slate-900">
                                    {option.label}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div className="h-full flex items-center justify-center py-10 border border-dashed border-white/5 rounded-xl">
                        <p className="text-xs text-slate-600">Drop cards here</p>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState 
              title="No candidates found" 
              detail="Upload a resume or check your active filter criteria." 
              action={
                <SecondaryButton type="button" onClick={() => document.querySelector('input[type=file]')?.click()}>
                  Upload file
                </SecondaryButton>
              } 
            />
          )}
        </SectionCard>
      </div>
    </AppShell>
  );
}
