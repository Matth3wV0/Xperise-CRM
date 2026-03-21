import { prisma } from "@xperise/database";

export async function createAuditLog(params: {
  userId: string;
  action: "create" | "update" | "delete";
  entity: string;
  entityId: string;
  changes?: Record<string, { old: unknown; new: unknown }>;
}) {
  await prisma.auditLog.create({
    data: {
      userId: params.userId,
      action: params.action,
      entity: params.entity,
      entityId: params.entityId,
      changes: params.changes as any ?? undefined,
    },
  });
}
