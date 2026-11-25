# Standalone community gap decisions and evidence

Reference: pinned source `20f5919c4efa5550a937898471dda7d17edecf92`. This audit inspected the schemas, controllers, routes and contribution service, skipping the upstream README. Reference source hashes are in `community-reference-digests.json`.

| Source behavior / plan requirement | Standalone mapping | Access and privacy | Evidence |
| --- | --- | --- | --- |
| `backend/schemas/contributionSchema.js`, `routes/contributions.js`: `new_problem`, `testcase_improvement` | `POST /api/practice/community/contributions` validates structured proposals; both use the existing pending publication queue. Existing generic contributions remain compatible. | Authenticated contributor; testcase improvements require an explicitly published ordinary Practice problem. Payloads are returned only in the owner's history and super-admin review queue. | `backend/tests/community-moderation.test.ts`: both payloads, malformed cases, actual public/draft/contest targets, owner boundaries, rejection feedback and no public grading-data leakage. Real browser submits and reviews a proposal. |
| `backend/services/contribution.js`: approval reviews and rewards a proposal | Existing `/admin/board/:id` review, transaction and idempotent credit grant retained. Review reasons now persist for all submissions. | Super admin only. Approval does not alter grading or publish an exercise; release verification remains Gate A. | Database and browser checks verify approval and unchanged catalogue. |
| `backend/schemas/opportunitySchema.js`, `controllers/opportunityController.js`: eleven opportunity types and deadline filtering | Preserve Internship, Job, Hackathon and Program, plus Research internship, Open source program, Fellowship, Coding competition, Student program, Scholarship, Developer program and Other. Add category, remote and closing-within-seven-days filters. Imported reference types retain their specific taxonomy. | Public list returns only published, unexpired entries and the existing safe projection. Admin import/create and source verification retain their role checks. | Database visibility/filter tests; browser creates and discovers a Fellowship; existing import fixture expects the specific Research internship type. |
| Plan Gate C: report and moderator removal | `POST /reports`, `PATCH /admin/reports/:id` use the existing private publication queue with the additive REPORT kind. Uphold removes a public feature or unpublishes an opportunity; dismiss leaves it available. | Authenticated reporters can target only currently public features or active opportunities. Reporter row locking deduplicates simultaneous pending reports. Only super admins resolve reports. Generic reviews cannot bypass report moderation. Report reasons/targets never appear in public discovery. | Database tests cover hostile private/contribution targets, expired/unpublished opportunities, concurrent reports, unauthorized review, repeat review, removal from discovery/clicks/votes and atomic audits. Real browser completes reporting and removal. |

The inspected pinned contribution and opportunity routes do not implement a report endpoint. Reporting is an explicit completion-plan addition, rather than a claim about an upstream endpoint.

Additive migration: `202611210002_standalone_editions_community` adds REPORT, nullable publication payload and nullable review reason, alongside the root-owned Edition migration. The existing opportunity category column accommodates all values. Shared OpportunityImportCandidate and frontend/backend DTO copies use one exported category list.

Audit events: existing `practice_publication_reviewed` plus `practice_report_reviewed` and `practice_publication_removed`. Moderation changes and audit records share one transaction. Existing contribution reward credits remain historical after moderation.

Verification observed in this run:

- `npm exec -w @codeclub/backend -- vitest run tests/community-moderation.test.ts`: **7 passed**, including disposable PostgreSQL checks; no skipped checks in this targeted run.
- Backend `tsc --noEmit`, frontend `typecheck`, and `contracts:check`: passed.
- `integration/standalone/verify-community.mts`: **5 real Chromium scenarios passed** against isolated API/Vite and disposable accounts. Report and mobile/admin screenshots are in `community-evidence/`. It cleans up its fixture accounts and opportunity and never mutates the running demo database.

Browser reproduction (PowerShell, from the standalone repository):

```powershell
$env:PRACTICE_TEST_DATABASE_URL = 'postgresql://practice:local_practice@127.0.0.1:15432/practice_test?schema=public'
$env:PLAYWRIGHT_MODULE = '<installed playwright directory>/index.mjs'
# Optional when reusing an existing Chromium binary:
$env:PLAYWRIGHT_EXECUTABLE = '<absolute Chromium executable>'
npm exec -- tsx integration/standalone/verify-community.mts
```

This scoped audit does not claim byte-for-byte feature parity with every upstream administration screen. Existing standalone review, reward, opportunity import and audited publication flows were extended rather than replaced.
