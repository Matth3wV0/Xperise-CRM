import { prisma } from "@xperise/database";

/**
 * Find a company by name using exact → partial → fuzzy matching.
 */
export async function findCompanyByName(searchName: string) {
  const lower = searchName.toLowerCase().trim();

  // 1. Exact (case-insensitive)
  const exact = await prisma.company.findFirst({
    where: { name: { equals: searchName, mode: "insensitive" } },
  });
  if (exact) return exact;

  // 2. Company name contains the search string
  const partial = await prisma.company.findFirst({
    where: { name: { contains: searchName, mode: "insensitive" } },
  });
  if (partial) return partial;

  // 3. Load all names and do bidirectional contains (handles abbreviations)
  const all = await prisma.company.findMany({
    select: { id: true, name: true, industry: true },
  });

  const match = all.find((c) => {
    const cLower = c.name.toLowerCase();
    return cLower.includes(lower) || lower.includes(cLower);
  });

  return match ?? null;
}

/**
 * Find the primary contact for a company to log an action against.
 * Priority: most recently touched contact assigned to user.
 * Fallback: any contact in the company.
 */
export async function findPrimaryContact(
  companyId: string,
  userId: string,
  userRole: string
) {
  const isStaff = userRole === "BD_STAFF";

  // For BD_STAFF: prefer their assigned contacts
  if (isStaff) {
    const assigned = await prisma.contact.findFirst({
      where: { companyId, assignedToId: userId },
      orderBy: [{ lastTouchedAt: "desc" }, { createdAt: "desc" }],
      include: {
        company: { select: { id: true, name: true, industry: true } },
      },
    });
    if (assigned) return assigned;
  }

  // Fallback / Admin/Manager: any contact in company
  return prisma.contact.findFirst({
    where: { companyId },
    orderBy: [{ lastTouchedAt: "desc" }, { createdAt: "desc" }],
    include: {
      company: { select: { id: true, name: true, industry: true } },
    },
  });
}
