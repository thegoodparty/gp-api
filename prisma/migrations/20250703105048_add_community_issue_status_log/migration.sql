-- CreateTable
CREATE TABLE "community_issue_status_log" (
    "id" SERIAL NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "from_status" "IssueStatus",
    "to_status" "IssueStatus" NOT NULL,
    "community_issue_id" INTEGER NOT NULL,

    CONSTRAINT "community_issue_status_log_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "community_issue_status_log" ADD CONSTRAINT "community_issue_status_log_community_issue_id_fkey" FOREIGN KEY ("community_issue_id") REFERENCES "community_issue"("id") ON DELETE CASCADE ON UPDATE CASCADE;
