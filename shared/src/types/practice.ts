// Shared wire DTOs. Sync this file to the Fastify module with npm run contracts:sync.
export type PracticeLanguage = 'python' | 'javascript' | 'java' | 'cpp' | 'c' | 'typescript';
export type LanguageChoice = { key: PracticeLanguage; label: string; editor: string; indentSize: number };
export type Difficulty = 'EASY' | 'MEDIUM' | 'HARD';
export type PracticeVerdict = 'Accepted' | 'Wrong Answer' | 'Compilation Error' | 'Runtime Error' | 'Time Limit Exceeded';
export type SessionUser = { id: string; name: string; email: string; role: 'STUDENT' | 'TEACHER' | 'ADMIN' | 'SUPER_ADMIN' };
export type LeaderboardRow = {
  rank: number; handle: string; college: string | null; xp: number; level: number;
  solved: number; streak: number; easy: number; medium: number; hard: number;
};
export type LeaderboardPage = {
  rows: LeaderboardRow[]; total: number; page: number; limit: number;
  capped: boolean; hasNext: boolean; college?: string;
};
export type CohortImportStatus = 'enrolled' | 'invited' | 'already-member' | 'already-invited' | 'duplicate' | 'invalid-email' | 'unavailable' | 'capacity';
export type CohortImportResult = {
  rows: Array<{ row: number; email: string; status: CohortImportStatus }>;
  summary: Record<CohortImportStatus, number>;
};
export const recruiterRoles = ['Backend', 'Frontend', 'Full Stack', 'Mobile', 'Data / ML', 'DevOps', 'QA', 'Other'] as const;
export type RecruiterRole = typeof recruiterRoles[number];
export type HiringPreferences = { availableForWork: boolean; preferredRole: RecruiterRole | null; expectedGraduation: number | null };
export type LeetCodeStats = {
  username: string; source: 'manual' | 'fetched'; easy: number; medium: number; hard: number;
  total: number; recordedAt: string; stale: boolean;
};
export type CandidateDirectoryRow = HiringPreferences & {
  handle: string; bio: string; college: string | null;
  solved: number; easy: number; medium: number; hard: number; xp: number; level: number; streak: number; topTopics: string[];
  leetcode: LeetCodeStats | null;
};
export type CandidateDirectoryPage = { candidates: CandidateDirectoryRow[]; next: string | null };

export type AssignmentCompletion = {
  id: string; title: string; startsAt: string; dueAt: string; scoringEndsAt: string; archived: boolean; archivedAt: string | null;
  completed: number;
  problems: { id: string; title: string; slug: string | null }[];
  students: { id: string; name: string; email: string; solved: number; missing: string[] }[];
};

export type PracticeNotification = {
  id: string; title: string; message: string; link: string; createdAt: string; readAt: string | null;
};
export type NotificationPage = { notifications: PracticeNotification[]; next: string | null };

export type OfficerStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
export type InstitutionStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'REVOKED';
export type InstitutionApplication = {
  id: string; domain: string; name: string; evidence: string; status: InstitutionStatus; version: number;
  submittedAt: string; reviewedAt: string | null; reason: string | null; university: { id: string; name: string } | null;
};
export type InstitutionOnboardingStatus = {
  domain: string | null; emailVerified: boolean; canJoin: boolean; canRequestOfficer: boolean;
  currentUniversity: { id: string; name: string } | null; recognized: { id: string; name: string } | null;
  history: InstitutionApplication[];
};
export type InstitutionReviewQueue = {
  page: number; hasNext: boolean;
  applications: Array<InstitutionApplication & { submittedEmail: string; applicant: { name: string } | null }>;
};
export type OfficerEvidenceInput = {
  kind: 'invitation' | 'staff_id' | 'document' | 'manual_note';
  label: string;
  reference?: string;
  note?: string;
};
export type OfficerEvidence = OfficerEvidenceInput & { addedAt: string };
export type OfficerApplication = {
  id: string; status: OfficerStatus; submittedEmail: string; submittedAt: string;
  reviewedAt: string | null; reason: string | null; evidence: OfficerEvidence[]; version: number;
};
export type OfficerApplicationStatus = {
  university: { id: string; name: string }; email: string; member: boolean; institutionalEmail: boolean; provisionsTeacher: boolean;
  history: OfficerApplication[];
};
export type OfficerReviewQueue = {
  page: number; hasNext: boolean;
  applications: (OfficerApplication & { applicant: { name: string; role: SessionUser['role'] }; university: { id: string; name: string } })[];
};

export type ReadinessCounts = {
  students: number; active: number; easy: number; medium: number; hard: number;
  totalSolved: number; averageSolved: number; activePercent: number; score: number;
};
export type InstitutionReadinessReport = {
  university: { id: string; name: string };
  range: { from: string; to: string };
  totals: ReadinessCounts;
  optedOut: number;
  unassigned: number;
  cohorts: (ReadinessCounts & { id: string; name: string; archived: boolean; topTopics: { topic: string; solves: number }[] })[];
  assignments: { total: number; opportunities: number; completed: number; percent: number };
  rankings: { name: string; solved: number; xp: number; streak: number }[];
};

export const opportunityCategories = ['Internship', 'Job', 'Hackathon', 'Program', 'Research internship', 'Open source program', 'Fellowship', 'Coding competition', 'Student program', 'Scholarship', 'Developer program', 'Other'] as const;

export type OpportunityImportCandidate = {
  title: string; company: string; category: '' | typeof opportunityCategories[number]; summary: string;
  applyUrl: string; sourceUrl: string; closingDate: string; remote: boolean; flags: string[]; invalidFields: string[];
};
export type OpportunityImportReport = {
  imported: Array<{ index: number; id: string; title: string }>;
  duplicates: Array<{ index: number; title: string }>;
  failed: Array<{ index: number; title: string; errors: string[] }>;
};

export type MockInterviewProblem = Pick<ProblemDetail, 'slug' | 'title' | 'topic' | 'difficulty' | 'description' | 'constraints' | 'starterCode' | 'languages' | 'cases'>;
export type MockInterviewTurn = { position: number; answer: string; question: string; createdAt: string };
export type MockInterviewSummary = {
  id: string; slug: string; title: string; difficulty: Difficulty; status: 'ACTIVE' | 'COMPLETED' | 'EXPIRED';
  startedAt: string; expiresAt: string; serverNow: string; usedMs: number; questions: number;
};
export type MockInterview = MockInterviewSummary & { problem: MockInterviewProblem; turns: MockInterviewTurn[] };
export type MockInterviewList = { enabled: boolean; eligible: boolean; sessions: MockInterviewSummary[] };

export type SolverHintStatus = { enabled: boolean; remaining: number | null; resetAt: string | null };
export type SolverHint = SolverHintStatus & { level: 1 | 2 | 3; hint: string; cached: boolean };

export type CoachingInsights = { strongestArea: string; weakestArea: string; nextStep: string; encouragement: string };
export type CoachingStatus = {
  enabled: boolean; hasActivity: boolean; insights: CoachingInsights | null; generatedAt: string | null; retryAt: string | null;
};

export type LearnerAnalytics = {
  progress: { level: number; xp: number; xpCurrent: number; xpNeeded: number; rank: string; solved: number; streak: { current: number; best: number } };
  submissions: { total: number; accepted: number; rate: number | null; averageRuntimeMs: number | null };
  topics: Array<{ topic: string; solved: number; covered: number; available: number }>;
  weeks: Array<{ start: string; end: string; solved: number }>;
  languages: Array<{ key: string; label: string; submissions: number }>;
  recent: Array<{ id: string; title: string; slug: string | null; language: string; verdict: PracticeVerdict; createdAt: string }>;
};

export type PracticeAnalytics = {
  generatedAt: string;
  accounts: { students: number; activeStudents: number; recruiters: number; activeRecruiters: number; members: number; activeMembers: number; registrationsToday: number };
  approvals: { recruiters: number; officers: number };
  practice: { published: number; submissions: number; accepted: number; acceptanceRate: number | null };
  engagement: { active7Days: number; active30Days: number; previous7Days: number; retained: number; retentionPercent: number | null };
  problems: { published: number; neverSolved: number; mostSolved: AnalyticsProblem[]; leastSolved: AnalyticsProblem[] };
  languages: Array<{ language: string; submissions: number; accepted: number }>;
};
type AnalyticsProblem = { slug: string; title: string; difficulty: Difficulty; acceptedCount: number };
export type PracticeAnalyticsTrend = {
  bucket: 'daily' | 'weekly' | 'monthly';
  periods: Array<{ start: string; end: string; label: string; registrations: number; submissions: number; accepted: number }>;
};

export type PracticeAccount = {
  id: string; name: string; email: string; role: 'STUDENT' | 'TEACHER' | 'ADMIN' | 'SUPER_ADMIN';
  isActive: boolean; approvalStatus: 'APPROVED' | 'PENDING' | 'REJECTED';
  createdAt: string; suspendedAt: string | null;
};

export type PracticeAccountPage = { accounts: PracticeAccount[]; next: string | null };

export type PracticeAuditPage = {
  entries: Array<{
    id: string; area: 'catalogue' | 'community' | 'placement' | 'membership' | 'accounts'; action: string; createdAt: string;
    actor: { name: string; email: string } | null;
    target: { id: string | null; type: string | null; label: string | null; state: string | null; reason: string | null };
  }>;
  next: string | null;
};

export type AmbassadorStatus = {
  application: {
    id: string; state: 'PENDING' | 'APPROVED' | 'REJECTED'; collegeName: string; collegeDomain: string | null;
    appliedAt: string; rejectionReason: string | null;
  } | null;
  dashboard: {
    referral: string | null; referred: number; earnedDays: number; bankedDays: number; billingEnabled: boolean;
    milestones: Array<{ id: string; threshold: number; rewardDays: number; achieved: boolean; claimed: boolean }>;
  } | null;
};

export type PracticePlanId = 'pro_monthly' | 'pro_yearly' | 'founding_lifetime' | 'lifetime';
export type PracticeGrantPlanId = PracticePlanId | 'ambassador_reward';
export type PracticePlanCatalogue = {
  enabled: boolean; checkoutAvailable: boolean;
  plans: Array<{ id: PracticePlanId; label: string; amountPaise: number; currency: 'INR'; durationDays: number | null }>;
};
export type PracticeMembership = {
  enabled: boolean; plan: PracticeGrantPlanId | 'free'; expiresAt: string | null;
  profilePdf: { remaining: number | null; month: string };
};

export type ProfileActivityReport = {
  name: string; handle: string | null; generatedAt: string;
  solved: number; xp: number; level: number; streak: { current: number; best: number };
  difficulty: Record<Difficulty, number>;
  strongestTopics: Array<{ topic: string; solved: number }>;
  recentSolves: Array<{ title: string; difficulty: Difficulty; solvedAt: string }>;
};

export type ProfileSnapshot = {
  id: string; handle: string; signedAt: string; solved: number;
  easy: number; medium: number; hard: number; xp: number; level: number;
};
export type ProfileVerification = { status: 'verified' | 'changed'; snapshot: ProfileSnapshot } | { status: 'invalid' };

export type CertificateSummary = { id: string; track: string; title: string; createdAt: string };
export type CertificateDocument = CertificateSummary & { issuerName: string; kind: 'certification' | 'practice-path' };
export type CertificationTrack = {
  id: string; title: string; topic: string; required: number; solved: number; certificateId: string | null;
};
export const weightedExpectation = { distribution: 'weighted-indices' } as const;
export type PracticeCase = { index: number; input: string; expected: string; comparison?: 'weighted-indices' };
export type PracticeCaseResult = PracticeCase & { actual: string; passed: boolean; error: string | null; time: number | null; memory: number | null };
export type ProblemSummary = { id: string; slug: string; title: string; topic: string; difficulty: Difficulty; saved: boolean; executionPending?: boolean; status: 'NOT_STARTED' | 'ATTEMPTED' | 'SOLVED' };
export type ProblemDetail = ProblemSummary & {
  description: string;
  contestOnly?: true;
  constraints: string[];
  hints: string[];
  starterCode: Partial<Record<PracticeLanguage, string>>;
  languages: LanguageChoice[];
  note: string;
  editorial: string | null;
  editorialLocked?: boolean;
  visualizerPath?: string;
  cases: PracticeCase[];
};
export type RunResult = { results: PracticeCaseResult[]; compileFailed: boolean; error: string | null };
export type PracticeReflectionRating = 'easy' | 'manageable' | 'challenging' | 'reallyDifficult';

export type Submission = {
  id: string;
  verdict: PracticeVerdict;
  language: PracticeLanguage;
  passed: number;
  total: number;
  visiblePassed: number;
  hiddenPassed: number;
  createdAt: string;
  runtimeMs: number | null;
  memoryKb: number | null;
  diagnostic: string | null;
  reflectionRating: PracticeReflectionRating | null;
};
export type SubmissionDetail = Submission & { code: string };
export type SubmitResult = { submission: Submission; solved: boolean };
export type CompilerResult = {
  status: 'Finished' | Exclude<PracticeVerdict, 'Accepted'>;
  stdout: string;
  stderr: string;
  compileOutput: string;
  time: number | null;
  memory: number | null;
  truncated: boolean;
};

export interface WeeklyReviewPreference {
  eligible: boolean;
  emailVerified: boolean;
  deliveryEnabled: boolean;
  enabled: boolean;
  lastSentAt: string | null;
}
