export const dayMs = 86_400_000;
const dayOffsetMs = 330 * 60_000;
export const localDay = (date: Date) => new Date(+date + dayOffsetMs).toISOString().slice(0, 10);
export const dayKey = (offset = 0) => localDay(new Date(Date.now() + offset * dayMs));
export const points = { EASY: 10, MEDIUM: 25, HARD: 50 } as const;

const xpForLevel = (level: number) => Math.round(12.44 * (level - 1) ** 1.6);

export function levelFor(xp: number) {
  const level = 1 + Math.floor((xp / 12.44) ** (1 / 1.6));
  return xpForLevel(level + 1) <= xp ? level + 1 : level;
}

export function levelProgress(xp: number) {
  const level = levelFor(xp);
  const base = xpForLevel(level);
  return { level, xpCurrent: xp - base, xpNeeded: xpForLevel(level + 1) - base };
}

export function currentStreak(days: Set<string>, today = dayKey()) {
  const lastDay = Date.parse(today);
  let result = 0;
  const yesterday = new Date(lastDay - dayMs).toISOString().slice(0, 10);
  const latest = days.has(today) ? lastDay : Date.parse(yesterday);
  while (days.has(new Date(latest - result * dayMs).toISOString().slice(0, 10))) result++;
  return result;
}

export function streak(days: Set<string>, today = dayKey()) {
  let best = 0;
  let current = 0;
  let previous: number | null = null;
  for (const day of [...days].sort()) {
    const date = Date.parse(day);
    current = previous !== null && date === previous + dayMs ? current + 1 : 1;
    previous = date;
    best = Math.max(best, current);
  }
  return { current: currentStreak(days, today), best };
}
