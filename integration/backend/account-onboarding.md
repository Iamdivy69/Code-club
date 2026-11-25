# Account and institution onboarding mapping

| Flow | Pinned reference | DSA V2 and standalone mapping |
| --- | --- | --- |
| Sign-up and sign-in | Code Club opens Google sign-in through Firebase, then loads the platform profile. | Embedded Practice calls the host auth middleware. Standalone Google sign-in issues DSA-compatible JWTs and uses the same learner identity and referral transaction as password signup. Existing users connect Google from their verified, signed-in CodeClub account. |
| Verification and recovery | The reference identity provider supplies hosted sign-in. | DSA already has `EmailVerificationToken` and `PasswordResetToken` tables and verification, resend, forgot-password, and reset routes. Use those route conventions and token tables in standalone. Keep expiry, one-time consumption, and invalidation of the account's prior sessions after a password reset. Store only token digests in the standalone service and use the existing DSA SMTP settings. |
| Officer application and evidence | A placement officer starts a registration and submits proof. College authority starts after individual review. | Practice already accepts an officer application and appends evidence with ownership and version checks. Reuse its approval and rejection queue. Embedded approval and account status remain DSA-owned. |
| Institution and domain | Code Club associates institutional authority with a verified college, and limits staff and invite actions to that college. | A DSA `University` owns classes, verified domains, and the relevant `Teacher` and `Student` links. Keep that graph for both shells. Add the missing institution request and domain review before provisioning the university association. Admins explicitly approve the requested domain and the authorized applicant. |
| Access and revocation | Primary officers grant scoped team access. | Reuse Practice placement-team grants and the host's role and approval status checks. Revocation must remove scoped Practice access from existing sessions while preserving the user's DSA identity and unrelated university roles. |

Verify email address changes, link replay and expiry, pending and rejected users, duplicate institution applications, cross-university access, staff downgrade during a session, and recovery without account enumeration. Legacy verified accounts and the existing demo account keep their normal sign-in path. New standalone users use verification when mail and onboarded signup are enabled. Test providers and credentials remain outside the source tree.

## Standalone account email

Standalone signup can send an email verification link. Accounts can request another verification link and recover access through a password reset email. These flows use the existing DSA token tables and store SHA-256 token digests. The link keeps the token in its browser fragment, and the user confirms the action from the screen. The database serializes link issuance and consumption per account. A one-minute resend interval prevents multiple concurrent messages for the same purpose, and a password reset revokes every session in the same transaction.

This slice uses the DSA SMTP settings and the existing host types without a migration. The embedded installer continues to mount the normal host auth and approval flows. SMTP delivery for the standalone account feature defaults to disabled. [Standalone configuration](../../README.md#standalone-verification-and-password-recovery)

## Hosted Google sign-in

Standalone CodeClub uses the Google authorization code flow with PKCE, a nonce, and a browser-bound state expiring after 10 minutes. The additive migration stores the short-lived attempt and associates the verified Google subject with the existing DSA user UUID. Each attempt can be consumed once. A linking attempt also requires the initiating CodeClub session to be active when the user returns from Google. Password reset and sign-out revoke that session and any pending linking attempt.

Google subjects identify linked accounts. An email match can prompt an existing user to sign in and connect Google, and linking verifies that the provider email matches the current CodeClub email. New users receive the independent practice learner role and retain any eligible signup referral. New users with third-party Google email addresses must verify through CodeClub mail. Embedded Practice continues to use the DSA host's sign-in. Live OAuth commissioning requires a configured web client and staging callback. [Google OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect) · [Standalone configuration](../../README.md#standalone-google-sign-in)

## Institution applications and access

A verified learner or teacher can request recognition of the institutional domain on their account. A Practice super admin reviews the evidence, then creates a DSA University or associates the domain with an existing one. The database prevents concurrent applications from reserving the same domain. The domain can be revoked independently. The existing learner's university records and enrollments survive that decision.

A verified standalone learner with the matching domain can join the recognized university from the Institution view. Existing DSA affiliations require an administrator-managed transfer. A separate officer application requires staff evidence before a super admin can provision a DSA teacher profile and placement-team access for an eligible standalone applicant. Existing DSA teachers continue through the officer review using their registered university. A super admin can remove the sole placement lead, or transfer leadership before removing a lead who has other team members. Authorizations are checked using the current database grants, including for sessions started before the decision.

Practice rollout rollback preserves approved University and Teacher writes in the host database. Use domain or team revocation to withdraw the corresponding Practice access.

[Reference sign-in adapter](https://github.com/SSVP-debug/code-club/blob/20f5919c4efa5550a937898471dda7d17edecf92/src/services/auth.js) · [Reference institution routes](https://github.com/SSVP-debug/code-club/blob/20f5919c4efa5550a937898471dda7d17edecf92/backend/routes/tpo.js)
