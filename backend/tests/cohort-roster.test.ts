import { describe, expect, it } from 'vitest';
import { parseRoster, rosterByteLimit } from '../src/modules/placement/cohort-roster.js';

describe('cohort CSV roster', () => {
  it('reads Excel BOMs, quoted multiline fields, ragged rows and physical line numbers', () => {
    const csv = '\uFEFFName,Email,Remarks\r\n"Last, First",FIRST@example.edu,"First line\r\nSecond line"\r\n\r\nMissing,\r\nRepeat,first@EXAMPLE.EDU\r\nNext,next@example.edu';
    expect(parseRoster(csv)).toEqual([
      { row: 2, email: 'first@example.edu' },
      { row: 5, email: '', issue: 'invalid-email' },
      { row: 6, email: 'first@example.edu', issue: 'duplicate' },
      { row: 7, email: 'next@example.edu' },
    ]);
  });

  it('rejects missing or duplicate email headers, bad quotes, oversized files and overlong rosters', () => {
    for (const invalid of [
      'student\nstudent@test.edu', 'Email,Email\na@test.edu,b@test.edu', 'email\n"bad', 'email\n\0',
      'x'.repeat(rosterByteLimit + 1), 'email\n' + 'student@test.edu\n'.repeat(10_001),
    ]) {
      expect(() => parseRoster(invalid)).toThrow(expect.objectContaining({ code: 'ROSTER_FILE' }));
    }
  });
});
