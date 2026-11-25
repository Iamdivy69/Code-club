import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import type { PDFFont, PDFPage } from 'pdf-lib';
import type { ProfileActivityReport } from '../../../../shared/src/types/practice';

const ink = rgb(.06, .1, .19);
const secondary = rgb(.26, .34, .43);
const accent = rgb(.02, .4, .52);
const wash = rgb(.954, .978, .983);
const rule = rgb(.76, .84, .87);
const date = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
const difficultyName = { EASY: 'Easy', MEDIUM: 'Medium', HARD: 'Hard' } as const;

function fitText(text: string, limit: number, widthOf: (value: string) => number) {
  if (widthOf(text) <= limit) return text;
  const characters = Array.from(text);
  while (widthOf(characters.join('') + '…') > limit && characters.length) characters.pop();
  return characters.join('').trimEnd() + '…';
}

async function drawLabel(pdf: PDFDocument, page: PDFPage, font: PDFFont, value: string,
  x: number, y: number, width: number, size: number, bold = false) {
  const text = Array.from(value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim()).slice(0, 512).join('');
  let label: string | undefined;
  try { label = fitText(text, width, (item) => font.widthOfTextAtSize(item, size)); }
  catch { /* Use browser font fallback for unsupported glyphs. */ }
  if (label !== undefined) {
    page.drawText(label, { x, y, size, font, color: ink });
    return;
  }

  const canvas = document.createElement('canvas');
  const height = Math.ceil(size * 1.6);
  canvas.width = width * 3;
  canvas.height = height * 3;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not render the report text.');
  ctx.scale(3, 3);
  ctx.font = (bold ? 'bold ' : '') + size + 'px system-ui, sans-serif';
  ctx.fillStyle = '#10192f';
  const baseline = Math.ceil(size * 1.18);
  ctx.fillText(fitText(text, width, (item) => ctx.measureText(item).width), 0, baseline);
  page.drawImage(await pdf.embedPng(canvas.toDataURL('image/png')), { x, y: y - (height - baseline), width, height });
}

export async function downloadProfileReport(report: ProfileActivityReport) {
  const pdf = await PDFDocument.create();
  pdf.setTitle('DSA V2 Practice Activity Report');
  pdf.setAuthor('DSA V2 Practice');
  pdf.setLanguage('en');
  const page = pdf.addPage([595.28, 841.89]);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const text = (value: string, x: number, y: number, size: number, heavy = false, color = ink) => {
    page.drawText(value, { x, y, size, font: heavy ? bold : regular, color });
  };
  const divider = (y: number) => page.drawLine({ start: { x: 44, y }, end: { x: 551, y }, thickness: 0.7, color: rule });

  page.drawRectangle({ x: 32, y: 667, width: 531, height: 132, color: wash });
  text('DSA V2 PRACTICE', 44, 774, 10, true, accent);
  text('Practice Activity Report', 44, 734, 29, true);
  await drawLabel(pdf, page, bold, report.name, 44, 702, 507, 16, true);
  text([report.handle && '@' + report.handle, 'Level ' + report.level, date.format(new Date(report.generatedAt)) + ' IST']
    .filter(Boolean).join('  |  '), 44, 682, 10, false, secondary);

  const metrics = [
    ['Problems solved', report.solved], ['XP', report.xp], ['Current streak', report.streak.current + ' days'], ['Best streak', report.streak.best + ' days'],
  ] as const;
  metrics.forEach(([label, value], index) => {
    const x = 44 + index * 130;
    text(String(value), x, 619, 20, true);
    text(label, x, 599, 10, false, secondary);
  });

  text('Difficulty breakdown', 44, 558, 13, true);
  Object.entries(difficultyName).forEach(([key, name], index) => {
    const x = 44 + index * 168;
    page.drawRectangle({ x, y: 522, width: 155, height: 24, color: wash });
    text(name + '   ' + report.difficulty[key as keyof typeof difficultyName], x + 10, 531, 11, true);
  });

  text('Strongest topics', 44, 489, 13, true);
  if (!report.strongestTopics.length) text('No solved topics yet.', 44, 465, 10, false, secondary);
  for (const [index, topic] of report.strongestTopics.entries()) {
    const x = index < 4 ? 44 : 307;
    const y = 465 - index % 4 * 21;
    await drawLabel(pdf, page, regular, topic.topic, x, y, 177, 10);
    text(String(topic.solved), x + 189, y, 10, true, accent);
  }

  divider(385);
  text('Recent solves', 44, 362, 13, true);
  if (!report.recentSolves.length) text('No problems solved yet.', 44, 335, 10, false, secondary);
  for (const [index, solve] of report.recentSolves.entries()) {
    const y = 335 - index * 23;
    await drawLabel(pdf, page, regular, solve.title, 44, y, 330, 10);
    text(difficultyName[solve.difficulty], 397, y, 10, false, secondary);
    text(date.format(new Date(solve.solvedAt)), 473, y, 10, false, secondary);
    divider(y - 8);
  }

  divider(71);
  text('Personal practice report', 44, 53, 9, false, secondary);

  const url = URL.createObjectURL(new Blob([new Uint8Array(await pdf.save())], { type: 'application/pdf' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'dsa-v2-practice-activity.pdf';
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
