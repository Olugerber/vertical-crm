import { Router } from 'express';
import { prisma } from '../db.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const events = await prisma.auditEvent.findMany({
      where: { orgId: req.auth.organizationId },
      orderBy: { when: 'desc' },
      take: 100,
    });
    res.json(events);
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
});

export default router;
