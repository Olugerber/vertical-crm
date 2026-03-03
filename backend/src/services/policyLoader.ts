import { prisma } from '../db.js';
import type { VerticalPolicy } from '../../../src/verticalCrm/CrmTypes.js';

export async function loadPolicy(organizationId: string): Promise<VerticalPolicy | null> {
  const org = await prisma.organization.findUnique({ where: { id: organizationId } });
  if (!org?.selectedVerticalPolicyId) return null;
  const policy = await prisma.verticalPolicy.findUnique({ where: { id: org.selectedVerticalPolicyId } });
  if (!policy) return null;
  // config JSON is the full VerticalPolicy shape
  return policy.config as unknown as VerticalPolicy;
}
