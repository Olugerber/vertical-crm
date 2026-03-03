import { Router } from 'express';
import { prisma } from '../db.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const policies = await prisma.verticalPolicy.findMany({ where: { orgId: req.auth.organizationId } });
    const org = await prisma.organization.findUnique({ where: { id: req.auth.organizationId } });
    res.json({ policies, selectedId: org?.selectedVerticalPolicyId });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.post('/select', async (req, res) => {
  try {
    const { policyId } = req.body as { policyId: string };
    await prisma.organization.update({ where: { id: req.auth.organizationId }, data: { selectedVerticalPolicyId: policyId } });
    res.json({ success: true, selectedId: policyId });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
});

export default router;
