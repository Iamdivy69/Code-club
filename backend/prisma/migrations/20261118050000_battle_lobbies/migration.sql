ALTER TABLE "practice_competitions"
    ALTER COLUMN "starts_at" DROP NOT NULL,
    ALTER COLUMN "ends_at" DROP NOT NULL,
    ADD COLUMN "battle_duration_minutes" INTEGER,
    ADD COLUMN "battle_max_team_size" INTEGER;

ALTER TABLE "practice_competitions" ADD CONSTRAINT "practice_competitions_battle_room_shape"
CHECK (
    (
        "battle_duration_minutes" IS NULL AND "battle_max_team_size" IS NULL
        AND "starts_at" IS NOT NULL AND "ends_at" IS NOT NULL
    ) OR (
        "kind" = 'BATTLE' AND "is_private" AND "join_code" IS NOT NULL
        AND "battle_duration_minutes" IS NOT NULL AND "battle_duration_minutes" BETWEEN 1 AND 10080
        AND "battle_max_team_size" IS NOT NULL AND "battle_max_team_size" BETWEEN 2 AND 6
        AND (
            ("starts_at" IS NULL AND "ends_at" IS NULL)
            OR ("starts_at" IS NOT NULL AND "ends_at" IS NOT NULL AND "ends_at" > "starts_at")
        )
    )
);

