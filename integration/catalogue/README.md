# Catalogue release evidence

The [release inventory](release-inventory.json) records every one of the 250 folders at the pinned Code Club revision. The offline converter found 1,488 structurally compatible problem-language pairs across 250 folders, including 238 with all six languages. Each entry records its source digest, proposed slug, content disposition, and candidate references. The workspace user confirmed reuse permission for all 250 problems, including statements, examples, editorials, starters, and hidden tests. The [approved manifest](reviewed-code-club.json) binds that approval to the pinned folder digests. The inventory and manifest contain metadata and digests only.

The eight edition mission slugs are outside the 250-folder inventory. Track their source decisions and test coverage when building editions. Challenge and certificate references in the inventory describe eligibility by visibility and topic. The final mapping depends on the approved content and the target DSA records. Target UUID and content-version fields remain empty until the reviewed database preview supplies those values.

## Current release checks

- All 250 approved digests matched the pinned checkout. Read-only previews against the standalone database and the seeded DSA V2 rehearsal both classified all 250 entries as new, with zero slug collisions. The DSA preview preserved the seeded problem, progress, and interview row counts. Review explicit legacy mappings before import even where the slugs do not collide.
- The JavaScript pilot used an original accepted solution and an original wrong solution for an approved `contains-duplicate` batch. The CLI passed all six cases for the accepted solution and rejected four for the wrong solution through a local Judge0-compatible fixture. Release-grade verification on a private Judge0 deployment is pending. [Pilot report](verifier-fixture-evidence.json)
- The first hidden `two-sum` fixture expects a pair that fails the problem's sum condition. The input also contains two valid index pairs while the statement promises a single solution. Keep this exercise out of the released catalogue until the case is repaired, reviewed, and rerun.
- REA parsed the four compiled catalogue entry point, importer, evaluator, and verifier files with zero failures. Evidence `ev_ed524bcd5d6fb307b538e167c5da42e60cf016e855793a009410f6f2af4fd5bb` records artifact SHA-256 `339b19eb8e61699fe0dc49c9247172f0911bdf20643874a62bdaa0cf9418eba2`.

## Verify a reviewed batch

1. Complete the [content review manifest](../../README.md#import-a-problem-catalogue) for the batch. Record reuse rights or prepare original replacements with their own source identity and digest.
2. Run the importer in offline preview with the review manifest. Each approved entry reports the `contentDigest` of the converted specification.
3. Create a solution manifest keyed by reviewed slug. Include the `contentDigest` and filenames for an accepted and an intentionally wrong solution in every enabled language. Paths are relative to the solution manifest. Use separate fixture files for the two solutions.

```json
{
  "entries": {
    "batch-total": {
      "contentDigest": "replace-with-the-converted-content-digest",
      "languages": {
        "javascript": { "accepted": "solutions/batch-total/accepted.js", "wrong": "solutions/batch-total/wrong.js" }
      }
    }
  }
}
```

4. Run the verifier against the controlled Judge0 endpoint selected for the release. If needed, supply `CATALOGUE_JUDGE_API_KEY` or `CATALOGUE_JUDGE_RAPIDAPI_KEY` in the shell environment.

```powershell
npm run --silent catalogue:import -- --source 'D:/catalogue/batch' --manifest 'D:/catalogue/batch-review.json' --solutions 'D:/catalogue/batch-solutions.json' --judge 'https://judge.example.test/submissions' > catalogue-runtime-report.json
```

The verifier uses the production driver and evaluator for each stored case. It requires the accepted solution to pass every case and the wrong solution to return a legitimate wrong answer for at least one case. An incomplete or stale review, missing fixture, or failing verdict exits with code 2. The report contains verdicts, counts, content and fixture digests, and Judge0 runtime IDs. Keep successful reports with the content manifest and release revision.

5. Run the existing database comparison with the same reviewed manifest. Review collisions, planned versions, and DSA UUIDs before apply. Keep verified imports as drafts until their mapping and browser checks pass. Compare again after apply and check for unexpected changes.

## Standalone preparation candidate

The [current standalone preparation record](PREPARATION.md) reproduces all 250 approved digests, records Two Sum and Min Stack candidate fixture repairs, prepares 52 solution pairs, and links the 36-pair local runtime check and repeated 250-draft import rehearsal. The controlled Judge0 release gate and remaining 1,436 solution pairs are still open.
