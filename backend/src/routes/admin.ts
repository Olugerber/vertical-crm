import { Router } from 'express';
import { prisma } from '../db.js';
import { adminGuard } from '../middleware/adminGuard.js';

const router = Router();
router.use(adminGuard);

// Org
router.get('/org', async (req, res) => {
  try {
    const org = await prisma.organization.findUnique({ where: { id: req.auth.organizationId } });
    if (!org) { res.status(404).json({ error: 'Org not found' }); return; }
    res.json(org);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.put('/org', async (req, res) => {
  try {
    const { name, website, industry } = req.body;
    const org = await prisma.organization.update({
      where: { id: req.auth.organizationId },
      data: { ...(name && { name }), ...(website !== undefined && { website }), ...(industry !== undefined && { industry }) },
    });
    res.json(org);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Policy
router.get('/policy/active', async (req, res) => {
  try {
    const org = await prisma.organization.findUnique({ where: { id: req.auth.organizationId } });
    if (!org?.selectedVerticalPolicyId) {
      res.json({ active: false, policy: null });
      return;
    }
    const policy = await prisma.verticalPolicy.findUnique({ where: { id: org.selectedVerticalPolicyId } });
    res.json({ active: !!policy, policy });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post('/policy/activate', async (req, res) => {
  try {
    const config = req.body.config ?? req.body;
    // Basic validation
    const required = ['verticalPolicyId', 'verticalKey', 'version', 'stages', 'transitions', 'approvalRules', 'complianceRules'];
    const missing = required.filter(k => !(k in config));
    if (missing.length) {
      res.status(400).json({ error: `Missing required policy fields: ${missing.join(', ')}` });
      return;
    }
    const policy = await prisma.verticalPolicy.upsert({
      where: { id: config.verticalPolicyId },
      create: {
        id: config.verticalPolicyId,
        orgId: req.auth.organizationId,
        verticalKey: config.verticalKey,
        version: config.version,
        config,
        activatedAt: new Date(),
        activatedBy: req.auth.userId,
      },
      update: {
        verticalKey: config.verticalKey,
        version: config.version,
        config,
        activatedAt: new Date(),
        activatedBy: req.auth.userId,
      },
    });
    await prisma.organization.update({
      where: { id: req.auth.organizationId },
      data: { selectedVerticalPolicyId: policy.id },
    });
    res.json({ success: true, policy });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Users
router.get('/users', async (req, res) => {
  try {
    const users = await prisma.user.findMany({ where: { orgId: req.auth.organizationId }, orderBy: { name: 'asc' } });
    res.json(users);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post('/users', async (req, res) => {
  try {
    const { email, name, roles } = req.body;
    if (!email || !name) { res.status(400).json({ error: 'email and name required' }); return; }
    const user = await prisma.user.create({
      data: { orgId: req.auth.organizationId, email, name, roles: roles ?? [] },
    });
    res.status(201).json(user);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post('/users/:id/roles', async (req, res) => {
  try {
    const { roles } = req.body;
    if (!Array.isArray(roles)) { res.status(400).json({ error: 'roles must be an array' }); return; }
    const user = await prisma.user.updateMany({
      where: { id: req.params['id'], orgId: req.auth.organizationId },
      data: { roles },
    });
    if (user.count === 0) { res.status(404).json({ error: 'User not found' }); return; }
    const updated = await prisma.user.findFirst({ where: { id: req.params['id'], orgId: req.auth.organizationId } });
    res.json(updated);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

export default router;
