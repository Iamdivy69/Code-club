CREATE TABLE "practice_google_identities" (
    "subject" VARCHAR(255) PRIMARY KEY CHECK (length("subject") > 0),
    "user_id" UUID NOT NULL UNIQUE REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "practice_google_attempts" (
    "state_digest" VARCHAR(64) PRIMARY KEY,
    "browser_digest" VARCHAR(64) NOT NULL,
    "nonce" VARCHAR(64) NOT NULL,
    "verifier" VARCHAR(64) NOT NULL,
    "next_path" VARCHAR(500) NOT NULL,
    "referral" VARCHAR(64),
    "link_session_id" UUID REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    "expires_at" TIMESTAMPTZ(3) NOT NULL
);

CREATE INDEX "practice_google_attempts_expires_at_idx" ON "practice_google_attempts"("expires_at");
CREATE INDEX "practice_google_attempts_browser_digest_idx" ON "practice_google_attempts"("browser_digest");
CREATE INDEX "practice_google_attempts_link_session_id_idx" ON "practice_google_attempts"("link_session_id");
