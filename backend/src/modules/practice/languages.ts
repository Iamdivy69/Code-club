import { z } from 'zod';
import type { PracticeLanguage } from './contracts.js';

export const languages = {
  python: { key: 'python', label: 'Python', judgeId: 71, editor: 'python', indentSize: 4 },
  javascript: { key: 'javascript', label: 'JavaScript', judgeId: 63, editor: 'javascript', indentSize: 2 },
  java: { key: 'java', label: 'Java', judgeId: 62, editor: 'java', indentSize: 4 },
  cpp: { key: 'cpp', label: 'C++', judgeId: 54, editor: 'cpp', indentSize: 4 },
  c: { key: 'c', label: 'C', judgeId: 50, editor: 'c', indentSize: 4 },
  typescript: { key: 'typescript', label: 'TypeScript', judgeId: 74, editor: 'typescript', indentSize: 2 },
} as const satisfies Record<PracticeLanguage, { key: PracticeLanguage; label: string; judgeId: number; editor: string; indentSize: number }>;
export const languageKey = z.enum(['python', 'javascript', 'java', 'cpp', 'c', 'typescript']);
// The authored starter is the availability switch for a particular problem.
export const startersSchema = z.partialRecord(languageKey, z.string().min(1).max(50_000));
