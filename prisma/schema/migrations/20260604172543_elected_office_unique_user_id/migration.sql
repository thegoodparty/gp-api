-- Guard: abort if any duplicate row slated for deletion has child records.
-- Poll, PollIndividualMessage, MeetingBriefing and MeetingResourceLocation all
-- cascade-delete from elected_office, so deleting a duplicate with children
-- would silently destroy real data. If this fires, re-parent or remove the
-- children manually before re-running.
DO $$
DECLARE
  with_children int;
BEGIN
  SELECT count(*) INTO with_children
  FROM "elected_office" eo
  WHERE eo.id NOT IN (
    SELECT DISTINCT ON (user_id) id
    FROM "elected_office"
    ORDER BY user_id, created_at ASC
  )
  AND (
    EXISTS (SELECT 1 FROM "poll" t WHERE t.elected_office_id = eo.id)
    OR EXISTS (
      SELECT 1 FROM "poll_individual_message" t
      WHERE t.elected_office_id = eo.id
    )
    OR EXISTS (
      SELECT 1 FROM "meeting_briefing" t WHERE t.elected_office_id = eo.id
    )
    OR EXISTS (
      SELECT 1 FROM "meeting_resource_location" t
      WHERE t.elected_office_id = eo.id
    )
  );

  IF with_children > 0 THEN
    RAISE EXCEPTION
      'Dedup aborted: % duplicate elected_office row(s) have child records; re-parent or remove them before applying.',
      with_children;
  END IF;
END $$;

-- Dedup: keep the earliest row per user_id, delete duplicates
DELETE FROM "elected_office"
WHERE id NOT IN (
  SELECT DISTINCT ON (user_id) id
  FROM "elected_office"
  ORDER BY user_id, created_at ASC
);

-- DropIndex
DROP INDEX "elected_office_user_id_idx";

-- CreateIndex
CREATE UNIQUE INDEX "elected_office_user_id_key" ON "elected_office"("user_id");
