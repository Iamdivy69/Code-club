CREATE TABLE "practice_placement_team" (
    "user_id" UUID PRIMARY KEY REFERENCES "teachers"("user_id") ON DELETE CASCADE ON UPDATE CASCADE,
    "university_id" UUID NOT NULL REFERENCES "universities"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "joined_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "practice_placement_team_university_id_idx" ON "practice_placement_team"("university_id");
CREATE UNIQUE INDEX "practice_placement_team_one_primary" ON "practice_placement_team"("university_id") WHERE "is_primary";
