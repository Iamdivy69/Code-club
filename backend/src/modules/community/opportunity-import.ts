import { createHash } from 'node:crypto';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { AppError } from '../../errors.js';
import { requirePracticeAdmin } from '../admin/access.js';
import { recordPracticeAudit } from '../admin/audit.js';
import { opportunityCategories, type OpportunityImportCandidate } from '../practice/contracts.js';
import type { PracticeOptions } from '../practice/routes.js';
import { extractOpportunityText } from './opportunity-extraction.js';

const category = z.enum(opportunityCategories);
const httpsUrl = z.url().max(2048).refine((value) => {
  const url = URL.parse(value);
  return url?.protocol === 'https:' && !url.username && !url.password;
}, 'Enter an HTTPS URL without sign-in details.');
export const opportunityFields = z.object({
  title: z.string().trim().min(3).max(120),
  company: z.string().trim().min(2).max(100),
  category,
  summary: z.string().trim().min(10).max(2000),
  applyUrl: httpsUrl,
  remote: z.boolean(),
});
const importFields = opportunityFields.extend({
  sourceUrl: httpsUrl,
  closingDate: z.union([z.iso.date(), z.literal('')]),
});
const limit = 25;
const candidates = z.array(z.unknown()).max(limit);
const extractionShape = z.union([candidates, z.object({ opportunities: candidates }).transform((value) => value.opportunities)]);
const rawCandidate = z.object({
  title: z.unknown().optional(), company: z.unknown().optional(), category: z.unknown().optional(), summary: z.unknown().optional(),
  applyUrl: z.unknown().optional(), sourceUrl: z.unknown().optional(), closingDate: z.unknown().optional(), remote: z.unknown().optional(),
  flags: z.unknown().optional(), organization: z.unknown().optional(), type: z.unknown().optional(),
  shortSummary: z.unknown().optional(), description: z.unknown().optional(), workMode: z.unknown().optional(),
  officialApplicationUrl: z.unknown().optional(), officialSourceUrl: z.unknown().optional(), applicationDeadline: z.unknown().optional(),
});
const label: Record<string, string> = {
  title: 'title', company: 'company', category: 'type', summary: 'summary', applyUrl: 'application URL',
  sourceUrl: 'official source URL', closingDate: 'closing date', remote: 'remote status',
};
const sourceCategories: Record<string, z.infer<typeof category>> = {
  internship: 'Internship', research_internship: 'Research internship', entry_level_job: 'Job', hackathon: 'Hackathon',
  open_source_program: 'Open source program', fellowship: 'Fellowship', coding_competition: 'Coding competition', student_program: 'Student program',
  scholarship: 'Scholarship', developer_program: 'Developer program', other: 'Other',
};
const clean = (value: unknown, max: number) => typeof value === 'string' ? value.trim().slice(0, max) : '';

function preview(raw: unknown): OpportunityImportCandidate {
  const row = rawCandidate.safeParse(raw).data;
  const deadline = clean(row?.closingDate ?? row?.applicationDeadline, 40);
  const sourceCategory = typeof row?.type === 'string' && Object.hasOwn(sourceCategories, row.type) ? sourceCategories[row.type] : undefined;
  const candidate = {
    title: clean(row?.title, 120), company: clean(row?.company ?? row?.organization, 100),
    summary: clean(row?.summary ?? row?.shortSummary ?? row?.description, 2000),
    category: category.safeParse(row?.category).data ?? sourceCategory ?? '',
    applyUrl: clean(row?.applyUrl ?? row?.officialApplicationUrl, 2048),
    sourceUrl: clean(row?.sourceUrl ?? row?.officialSourceUrl, 2048),
    closingDate: z.iso.datetime().safeParse(deadline).success ? deadline.slice(0, 10) : deadline,
    remote: row?.remote === true || row?.workMode === 'remote',
  } as const;
  const check = importFields.safeParse(candidate);
  const flags = Array.isArray(row?.flags) ? row.flags.slice(0, 8).map((value) => clean(value, 160)).filter(Boolean) : [];
  return { ...candidate, flags, invalidFields: check.error?.issues.map((issue) => String(issue.path[0])) ?? [] };
}

function parsedList(text: string, provider: boolean) {
  const fenced = /^\x60\x60\x60(?:json)?\s*([\s\S]*?)\s*\x60\x60\x60$/i.exec(text.trim());
  try {
    return extractionShape.parse(JSON.parse(fenced?.[1] ?? text)).map(preview);
  } catch {
    if (provider) throw new AppError(502, 'OPPORTUNITY_EXTRACTION_FAILED', 'The extraction service returned an invalid list. Try again.');
    throw new AppError(400, 'OPPORTUNITY_IMPORT_FORMAT', 'Paste a JSON array or an opportunities object with up to 25 listings.');
  }
}

function fingerprint(value: z.infer<typeof importFields>) {
  const url = new URL(value.applyUrl);
  url.hash = '';
  const parts = [value.title, value.company].map((item) => item.normalize('NFKC').replace(/\s+/g, ' ').toLowerCase());
  return createHash('sha256').update(JSON.stringify([...parts, url.href])).digest('hex');
}

export const opportunityImportRoutes: FastifyPluginAsync<Omit<PracticeOptions, 'execute'>> = async (app, { db, authenticate }) => {
  app.post('/admin/opportunities/import/extract', { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } }, async (request, reply) => {
    const { id } = await authenticate(request);
    await requirePracticeAdmin(db, id);
    const { researchText } = z.object({ researchText: z.string().trim().min(1).max(20_000) }).parse(request.body);
    reply.header('Cache-Control', 'private, no-store');
    const looksStructured = /^[{\[]/.test(researchText) || /^\x60{3}/.test(researchText);
    const text = looksStructured ? researchText : await extractOpportunityText(researchText, process.env, ['test', 'development'].includes(process.env.NODE_ENV ?? ''));
    return { opportunities: parsedList(text, !looksStructured) };
  });

  app.post('/admin/opportunities/import/bulk', async (request, reply) => {
    const { id } = await authenticate(request);
    await requirePracticeAdmin(db, id);
    reply.header('Cache-Control', 'private, no-store');
    const { opportunities } = z.object({ opportunities: candidates.min(1) }).parse(request.body);
    const rows = opportunities.map((item, index) => ({
      index, parsed: importFields.safeParse(item), title: preview(item).title || 'Untitled listing',
    }));
    const valid = rows.flatMap(({ parsed, index }) => parsed.success ? [{
      index, key: fingerprint(parsed.data), data: parsed.data,
    }] : []);
    const failed = rows.flatMap(({ parsed, index, title }) => parsed.success ? [] : [{
      index, title, errors: parsed.error.issues.map((issue) => 'Check ' + (label[String(issue.path[0])] ?? 'the listing')),
    }]);
    const report = await db.$transaction(async (tx) => {
      await requirePracticeAdmin(tx, id);
      const drafts = new Map<string, z.infer<typeof importFields>>();
      for (const row of valid) if (!drafts.has(row.key)) drafts.set(row.key, row.data);
      if (!drafts.size) return { imported: [], duplicates: [], failed };
      const created = await tx.practiceOpportunity.createManyAndReturn({
        data: [...drafts.keys()].sort().map((key) => {
          const { closingDate, ...data } = drafts.get(key)!;
          return { ...data, importFingerprint: key, published: false,
            closesAt: closingDate ? new Date(closingDate + 'T23:59:59.999Z') : null };
        }),
        skipDuplicates: true,
        select: { id: true, title: true, importFingerprint: true },
      });
      const inserted = new Map(created.map((item) => [item.importFingerprint, item.id]));
      for (const entry of created) {
        await recordPracticeAudit(tx, id, 'practice_opportunity_imported', {
          id: entry.id, type: 'opportunity', label: entry.title, state: 'Pending verification',
        });
      }
      const imported = [];
      const duplicates = [];
      for (const row of valid) {
        const entryId = inserted.get(row.key);
        if (entryId) {
          imported.push({ index: row.index, id: entryId, title: row.data.title });
          inserted.delete(row.key);
        } else {
          duplicates.push({ index: row.index, title: row.data.title });
        }
      }
      return { imported, duplicates, failed };
    });
    return reply.code(report.imported.length ? 201 : 200).send(report);
  });

  app.patch('/admin/opportunities/:id/verify', async (request, reply) => {
    const { id: actor } = await authenticate(request);
    await requirePracticeAdmin(db, actor);
    const { id } = z.object({ id: z.uuid() }).parse(request.params);
    z.object({ confirmed: z.literal(true) }).parse(request.body);
    return db.$transaction(async (tx) => {
      await requirePracticeAdmin(tx, actor);
      const entry = await tx.practiceOpportunity.findFirst({
        where: { id, importFingerprint: { not: null } }, select: { title: true, sourceUrl: true },
      });
      if (!entry?.sourceUrl) throw new AppError(404, 'NOT_FOUND', 'Imported opportunity not found.');
      const verifiedAt = new Date();
      const change = await tx.practiceOpportunity.updateMany({
        where: { id, verifiedAt: null }, data: { verifiedAt },
      });
      if (change.count) await recordPracticeAudit(tx, actor, 'practice_opportunity_verified', {
        id, type: 'opportunity', label: entry.title, state: 'Verified',
      });
      reply.header('Cache-Control', 'private, no-store');
      return { verified: true };
    });
  });
};
