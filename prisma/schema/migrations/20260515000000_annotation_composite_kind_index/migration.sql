-- CreateIndex
CREATE INDEX "annotation_author_user_id_resource_type_resource_id_kind_idx" ON "annotation"("author_user_id", "resource_type", "resource_id", "kind");
