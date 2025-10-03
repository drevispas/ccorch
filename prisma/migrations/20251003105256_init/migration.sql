-- CreateTable
CREATE TABLE "workflows" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_prompt" TEXT NOT NULL,
    "chain_name" TEXT NOT NULL,
    "complexity" TEXT NOT NULL,
    "current_step" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "created_at" BIGINT NOT NULL,
    "updated_at" BIGINT NOT NULL
);

-- CreateTable
CREATE TABLE "agent_results" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "workflow_id" TEXT NOT NULL,
    "agent_role" TEXT NOT NULL,
    "complexity" TEXT NOT NULL,
    "step_number" INTEGER NOT NULL,
    "results" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'COMPLETED',
    "created_at" BIGINT NOT NULL,
    CONSTRAINT "agent_results_workflow_id_fkey" FOREIGN KEY ("workflow_id") REFERENCES "workflows" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "workflow_transitions" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "workflow_id" TEXT NOT NULL,
    "from_step" INTEGER NOT NULL,
    "to_step" INTEGER NOT NULL,
    "from_agent" TEXT,
    "to_agent" TEXT,
    "reason" TEXT NOT NULL DEFAULT 'Agent completed successfully',
    "created_at" BIGINT NOT NULL,
    CONSTRAINT "workflow_transitions_workflow_id_fkey" FOREIGN KEY ("workflow_id") REFERENCES "workflows" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "idx_workflows_status" ON "workflows"("status");

-- CreateIndex
CREATE INDEX "idx_workflows_created" ON "workflows"("created_at");

-- CreateIndex
CREATE INDEX "idx_agent_results_workflow" ON "agent_results"("workflow_id");

-- CreateIndex
CREATE UNIQUE INDEX "agent_results_workflow_id_step_number_key" ON "agent_results"("workflow_id", "step_number");

-- CreateIndex
CREATE INDEX "idx_transitions_workflow" ON "workflow_transitions"("workflow_id");
