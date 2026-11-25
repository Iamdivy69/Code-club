# DSA V2 frontend installation

The kit mounts CodeClub’s Practice catalogue, solver, compiler, dashboard, certifications, competitions, placement, community, public profiles, and certificate verification in the pinned DSA V2 frontend. It uses DSA V2’s login, Axios client, sidebar, theme, and route guards. The shared screens and DTO are copied from CodeClub at install time.

## Preview and apply

Run `npm ci` in CodeClub, then preview the changes for disposable copies of both hosts. The [revision manifest](../baseline.json) lists the pinned commits.

```powershell
node integration/install.mjs --frontend 'D:/path/to/dsa-v2' --backend 'D:/path/to/dsa-backend'
node integration/install.mjs --frontend 'D:/path/to/dsa-v2' --backend 'D:/path/to/dsa-backend' --apply
```

The combined installer checks both targets before writing. To preview or apply only the frontend, use `node integration/frontend/install.mjs --target <checkout>` and add `--apply` when ready. A second preview against the matching installed version should show zero changes. The installer adds the pinned PDF generator and its resolved entries to the frontend lockfile. The manifest pins the frontend app entry, dependency files, and the host API, auth, theme, and navigation files used by the mount.

In the DSA V2 checkout, run `npm ci` and `npm run build --workspace frontend`. Serve the frontend with the same DSA API connection. In the DSA backend, follow the [backend instructions](../backend/README.md) for migrations, Prisma generation, and Judge0.

## Routes and rollback

- `/practice` uses the host’s Practice availability endpoint. With the backend flag enabled, the `/student/practice` and `/student/problems` aliases open the new catalogue with the query string preserved.
- `/solve/:slug` opens the Judge0 solver when a Practice contract exists. A slug without a Practice contract opens DSA V2’s existing solver. `/practice/legacy` opens the original catalogue for students and teachers.
- Set `PRACTICE_ENABLED=false` and restart the backend to restore the original catalogue and solver routes. Reload the frontend to read the new flag value. New submissions stay in the database and appear again when Practice is enabled.

## Browser rehearsal

Run the four [backend rehearsal phases](../backend/README.md#rehearsal-and-rollback) first. Keep the disposable database and fixture record. Build both installed checkouts, set the same local `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, and `PRACTICE_REHEARSAL_PASSWORD`, then run the browser check from CodeClub. The checker accepts a Playwright installation through `PLAYWRIGHT_MODULE` and a Chromium binary through `PLAYWRIGHT_EXECUTABLE`. It starts its own loopback preview and backend on ports 3012 and 5012 by default.

```powershell
node integration/frontend/verify-browser.mjs 'D:/path/to/dsa-v2' 'D:/path/to/dsa-backend' 'D:/path/to/fixture.json' 'D:/path/to/browser-artifacts'
```

The check uses the real host sign-in and refresh cookie, the installed UI, PostgreSQL, Redis, and a controlled Judge0 endpoint for an original exercise. It records desktop and mobile screenshots, opens the certification tracks, and exercises the flag with both hosts running.

A Practice referral link opens the DSA account form with the referral handle carried through signup. The form shows the pending approval confirmation. After approval, the first accepted ordinary practice submission qualifies the referral for the configured credits.
