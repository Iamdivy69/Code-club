import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import type { InstitutionReadinessReport } from '../../../../shared/src/types/practice';

const ink = rgb(.06, .1, .19);
const slate = rgb(.26, .34, .43);
const accent = rgb(.02, .4, .52);

export async function downloadReadiness(report: InstitutionReadinessReport) {
  const pdf = await PDFDocument.create();
  pdf.setTitle('DSA V2 Placement Readiness');
  pdf.setAuthor('DSA V2 Practice');
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let page = pdf.addPage([595.28, 841.89]);
  let y = 0;

  function header() {
    page.drawText('DSA V2 PRACTICE', { x: 42, y: 799, font: bold, size: 10, color: accent });
    page.drawText('Placement Readiness', { x: 42, y: 768, font: bold, size: 25, color: ink });
    page.drawLine({ start: { x: 42, y: 749 }, end: { x: 553, y: 749 }, color: accent, thickness: 1 });
    page.drawText('Confidential university report', { x: 42, y: 27, font: regular, size: 9, color: slate });
    y = 722;
  }

  function reserve(height: number) {
    if (y - height < 58) {
      page = pdf.addPage([595.28, 841.89]);
      header();
    }
  }

  async function line(value: string, heading = false) {
    const text = value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 512);
    const font = heading ? bold : regular;
    const size = heading ? 13 : 10;
    const maxWidth = 510;
    reserve(21);
    let width: number | undefined;
    try { width = font.widthOfTextAtSize(text, size); } catch { /* Text outside the font is rendered below. */ }
    if (width !== undefined) {
      const fitted = width > maxWidth ? size * maxWidth / width : size;
      page.drawText(text, { x: 42, y, font, size: fitted, color: ink });
    } else {
      const canvas = document.createElement('canvas');
      canvas.width = maxWidth * 3;
      canvas.height = 66;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Could not render the report text.');
      ctx.scale(3, 3);
      ctx.font = (heading ? 'bold ' : '') + size + 'px system-ui, sans-serif';
      ctx.fillStyle = '#10192f';
      ctx.fillText(text, 0, 15, maxWidth);
      page.drawImage(await pdf.embedPng(canvas.toDataURL('image/png')), { x: 42, y: y - 7, width: maxWidth, height: 22 });
    }
    y -= heading ? 23 : 17;
  }

  header();
  await line(report.university.name, true);
  await line('Assignment dates: ' + report.range.from + ' to ' + report.range.to);
  await line('Readiness: ' + report.totals.score + '/100');
  await line('Students sharing: ' + report.totals.students + ' | Active streaks: ' + report.totals.activePercent + '% | Average solved: ' + report.totals.averageSolved);
  await line('Problems solved: ' + report.totals.totalSolved + ' | Easy: ' + report.totals.easy + ' | Medium: ' + report.totals.medium + ' | Hard: ' + report.totals.hard);
  await line('Outside reporting: ' + report.optedOut + ' | Sharing students without a cohort: ' + report.unassigned);
  y -= 12;
  reserve(60);
  await line('Assignment completion', true);
  await line(report.assignments.completed + ' of ' + report.assignments.opportunities + ' student assignments completed across '
    + report.assignments.total + ' assignments (' + report.assignments.percent + '%).');

  y -= 12;
  reserve(66);
  await line('Cohort breakdown', true);
  if (!report.cohorts.length) await line('No cohorts yet.');
  for (const cohort of report.cohorts) {
    reserve(68);
    await line(cohort.name + (cohort.archived ? ' (Archived)' : '') + '  |  Readiness ' + cohort.score + '/100', true);
    await line(cohort.students + ' sharing | ' + cohort.averageSolved + ' average solved | ' + cohort.activePercent + '% active');
    if (cohort.topTopics.length) await line('Top topics: ' + cohort.topTopics.map(({ topic, solves }) => topic + ' (' + solves + ')').join(', '));
  }

  y -= 12;
  reserve(66);
  await line('Student rankings', true);
  if (!report.rankings.length) await line('No students sharing progress.');
  for (const [index, student] of report.rankings.entries()) {
    await line((index + 1) + '. ' + student.name + '  |  ' + student.solved + ' solved  |  ' + student.streak + ' day streak  |  ' + student.xp + ' XP');
  }

  const url = URL.createObjectURL(new Blob([new Uint8Array(await pdf.save())], { type: 'application/pdf' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'placement-readiness-' + report.range.to + '.pdf';
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
