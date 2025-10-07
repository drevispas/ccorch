-- AlterTable
ALTER TABLE "workflows" ADD COLUMN "session_id" TEXT;

-- CreateIndex
CREATE INDEX "idx_workflows_session_status" ON "workflows"("session_id", "status");
