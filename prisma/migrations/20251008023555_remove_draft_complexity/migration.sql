/*
  Warnings:

  - You are about to drop the column `draft_complexity` on the `workflows` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_workflows" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "session_id" TEXT,
    "user_prompt" TEXT NOT NULL,
    "chain_name" TEXT NOT NULL,
    "complexity" TEXT NOT NULL,
    "current_step" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "created_at" BIGINT NOT NULL,
    "updated_at" BIGINT NOT NULL
);
INSERT INTO "new_workflows" ("chain_name", "complexity", "created_at", "current_step", "id", "session_id", "status", "updated_at", "user_prompt") SELECT "chain_name", "complexity", "created_at", "current_step", "id", "session_id", "status", "updated_at", "user_prompt" FROM "workflows";
DROP TABLE "workflows";
ALTER TABLE "new_workflows" RENAME TO "workflows";
CREATE INDEX "idx_workflows_status" ON "workflows"("status");
CREATE INDEX "idx_workflows_created" ON "workflows"("created_at");
CREATE INDEX "idx_workflows_session_status" ON "workflows"("session_id", "status");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
