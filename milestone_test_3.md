# Milestone 3 - Candidate Management CRM & ATS Pipeline Verification

This document outlines the validation details for Milestone 3. This workspace delivers a fully functional Candidate CRM and ATS Pipeline. It enables real-time search, filters, drag-and-drop Kanban columns, status tracking, candidate profile lookups, and a tagging system. All modules compile successfully with zero linting errors.

---

## 📋 Deliverables & Verification Checklist

This checklist outlines the primary features verified across the Candidate Management modules. Every component was tested, including responsive page layouts, data retrieval, and state mutations. Features were confirmed fully functional on the frontend and integrated with the Supabase database.

- [x] **Candidate Management Dashboard**: Recruiters use the central dashboard to view all active candidate records categorized by recruitment stages. By visiting this page, you get an immediate visual summary of applicant counts per phase, allowing teams to analyze pipeline health, upload new resumes, and click cards to open candidate profiles instantly.
- [x] **Candidate Profile Pages**: When a recruiter clicks a candidate card, the system navigates to a dynamic profile route containing complete candidate details. The page displays extracted contact details, location, experience metadata, parsed raw resume documents, AI alignment scores, scheduled interview timelines, and historical logs tracking previous stage transitions.
- [x] **Notes and Tagging System**: Recruiters evaluate candidate compatibility by adding feedback inside the profile page notes section. You can type observations, input custom tags like 'senior' or 'react', and press Enter to save them. The saved notes immediately render on the activity timeline accompanied by color-coded tag chips.
- [x] **Search and Filtering Functionality**: Users locate qualified applicants by typing terms into the search bar, which queries candidate names, current company names, job titles, and skills. You can refine matching parameters by selecting minimum years of experience or picking specific skills from a dynamically populated unique skills dropdown list.
- [x] **Drag-and-Drop ATS Kanban Board**: The Kanban board uses native HTML5 drag-and-drop mechanics to streamline stage transitions. Recruiters click and drag candidate cards between columns, triggering a smooth hover border transition. Upon dropping a card, the system updates the backend and database dynamically to maintain accurate recruitment status persistence.
- [x] **Recruitment Stage Management**: The recruitment pipeline is divided into six stages: New, Parsed, Shortlisted, Interview Scheduled, Selected, and Rejected. Columns automatically segment candidates by their active phase. Recruiters can quickly view candidate counts at each level and move applicants through the hiring lifecycle using drop-down selectors.
- [x] **Candidate Status Tracking**: Candidate phase updates trigger background REST mutation requests to modify records in Supabase. The system logs every change in the backend, saving stage transitions with timestamps. Recruiters can view chronological history logs inside the candidate's profile to track the exact path an applicant took.
- [x] **Layout Integrity**: Applied grid min-width constraints (`min-w-0 w-full`) to prevent horizontal layout stretching. The page horizontal scrollbar is confined properly.
- [x] **AI Quota Fallback parsing**: Added local regex-based parsing heuristics to extract Email, Phone, and Location directly from the raw PDF text if the Gemini API fails (e.g. quota limits, rate limits).

---

## 🛠️ Build & Linter Logs

The project structure complies with linter guidelines and Next.js specifications. Verification commands confirm that the Express backend and Next.js frontend compile correctly. No compilation warnings, type checks, or linting exceptions are present in the final build verification logs.

- **Linter Output**: ESLint passes cleanly without any formatting or hook violations.
- **Next.js Production Build**: Production builds successfully compilation-free (`next build --webpack`).
