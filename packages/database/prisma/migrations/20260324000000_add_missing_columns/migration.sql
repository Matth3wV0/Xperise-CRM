-- CreateEnum
CREATE TYPE "AgentType" AS ENUM ('HUNTER', 'WRITER', 'TRACKER', 'STRATEGIST');

-- CreateEnum
CREATE TYPE "AgentRunStatus" AS ENUM ('RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AgentActionStatus" AS ENUM ('PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'EXECUTED', 'FAILED');

-- AlterEnum
ALTER TYPE "ActionType" ADD VALUE 'LINKEDIN_ACCEPTED';

-- AlterEnum
ALTER TYPE "ContactStatus" ADD VALUE 'MET';
ALTER TYPE "ContactStatus" ADD VALUE 'NURTURE';
ALTER TYPE "ContactStatus" ADD VALUE 'LOST';

-- AlterTable
ALTER TABLE "campaigns" ADD COLUMN     "apolloSequenceId" TEXT;

-- AlterTable
ALTER TABLE "companies" ADD COLUMN     "digitalMaturity" TEXT,
ADD COLUMN     "hqLocation" TEXT,
ADD COLUMN     "tags" TEXT[];

-- AlterTable
ALTER TABLE "contacts" ADD COLUMN     "apolloContactId" TEXT,
ADD COLUMN     "stageChangedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "email_logs" ADD COLUMN     "apolloMessageId" TEXT;

-- CreateTable
CREATE TABLE "agent_runs" (
    "id" TEXT NOT NULL,
    "agentType" "AgentType" NOT NULL,
    "status" "AgentRunStatus" NOT NULL DEFAULT 'RUNNING',
    "trigger" TEXT NOT NULL,
    "inputSummary" TEXT,
    "outputSummary" TEXT,
    "tokensUsed" INTEGER NOT NULL DEFAULT 0,
    "costUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "error" TEXT,
    "metadata" JSONB,
    "triggeredById" TEXT,

    CONSTRAINT "agent_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_actions" (
    "id" TEXT NOT NULL,
    "actionType" TEXT NOT NULL,
    "status" "AgentActionStatus" NOT NULL DEFAULT 'PENDING_APPROVAL',
    "targetEntity" TEXT,
    "targetId" TEXT,
    "payload" JSONB NOT NULL,
    "result" JSONB,
    "approvedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "executedAt" TIMESTAMP(3),
    "agentRunId" TEXT NOT NULL,

    CONSTRAINT "agent_actions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "agent_runs_agentType_idx" ON "agent_runs"("agentType");

-- CreateIndex
CREATE INDEX "agent_runs_status_idx" ON "agent_runs"("status");

-- CreateIndex
CREATE INDEX "agent_runs_startedAt_idx" ON "agent_runs"("startedAt");

-- CreateIndex
CREATE INDEX "agent_actions_agentRunId_idx" ON "agent_actions"("agentRunId");

-- CreateIndex
CREATE INDEX "agent_actions_status_idx" ON "agent_actions"("status");

-- CreateIndex
CREATE INDEX "agent_actions_actionType_idx" ON "agent_actions"("actionType");

-- CreateIndex
CREATE UNIQUE INDEX "email_logs_apolloMessageId_key" ON "email_logs"("apolloMessageId");

-- AddForeignKey
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_triggeredById_fkey" FOREIGN KEY ("triggeredById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_actions" ADD CONSTRAINT "agent_actions_agentRunId_fkey" FOREIGN KEY ("agentRunId") REFERENCES "agent_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
