-- CreateTable
CREATE TABLE "position" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "topIssueId" INTEGER,

    CONSTRAINT "position_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TopIssue" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "icon" TEXT,

    CONSTRAINT "TopIssue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_CampaignTopIssues" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL
);

-- CreateTable
CREATE TABLE "_CampaignPositions" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "position_name_key" ON "position"("name");

-- CreateIndex
CREATE UNIQUE INDEX "TopIssue_name_key" ON "TopIssue"("name");

-- CreateIndex
CREATE UNIQUE INDEX "_CampaignTopIssues_AB_unique" ON "_CampaignTopIssues"("A", "B");

-- CreateIndex
CREATE INDEX "_CampaignTopIssues_B_index" ON "_CampaignTopIssues"("B");

-- CreateIndex
CREATE UNIQUE INDEX "_CampaignPositions_AB_unique" ON "_CampaignPositions"("A", "B");

-- CreateIndex
CREATE INDEX "_CampaignPositions_B_index" ON "_CampaignPositions"("B");

-- AddForeignKey
ALTER TABLE "position" ADD CONSTRAINT "position_topIssueId_fkey" FOREIGN KEY ("topIssueId") REFERENCES "TopIssue"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CampaignTopIssues" ADD CONSTRAINT "_CampaignTopIssues_A_fkey" FOREIGN KEY ("A") REFERENCES "campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CampaignTopIssues" ADD CONSTRAINT "_CampaignTopIssues_B_fkey" FOREIGN KEY ("B") REFERENCES "TopIssue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CampaignPositions" ADD CONSTRAINT "_CampaignPositions_A_fkey" FOREIGN KEY ("A") REFERENCES "campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CampaignPositions" ADD CONSTRAINT "_CampaignPositions_B_fkey" FOREIGN KEY ("B") REFERENCES "position"("id") ON DELETE CASCADE ON UPDATE CASCADE;
