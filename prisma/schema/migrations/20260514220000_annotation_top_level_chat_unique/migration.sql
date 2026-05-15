-- Enforce exactly one top-level chat annotation per (user, briefing).
-- "Top-level" = annotation with kind=chat AND no anchor (jsonPath IS NULL).
-- Anchored chat annotations (jsonPath IS NOT NULL) are NOT constrained by this index.
CREATE UNIQUE INDEX "annotation_top_level_chat_unique"
  ON "annotation" ("author_user_id", "resource_id", "resource_type")
  WHERE "kind" = 'chat' AND "json_path" IS NULL;
