import { Router } from 'express';
import { prisma } from '../db.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const { entityType, entityId, from, to, limit } = req.query;
    const where: any = { orgId: req.auth.organizationId };
    if (entityType) where.entityType = entityType as string;
    if (entityId) where.entityId = entityId as string;
    if (from || to) {
      where.when = {};
      if (from) where.when.gte = new Date(from as string);
      if (to) where.when.lte = new Date(to as string);
    }
    const events = await prisma.auditEvent.findMany({
      where,
      orderBy: { when: 'desc' },
      take: Math.min(Number(limit ?? 500), 1000),
    });
    res.json(events);
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.get('/export.csv', async (req, res) => {
  try {
    const { entityType, entityId, from, to } = req.query;
    const where: any = { orgId: req.auth.organizationId };
    if (entityType) where.entityType = entityType as string;
    if (entityId) where.entityId = entityId as string;
    if (from || to) {
      where.when = {};
      if (from) where.when.gte = new Date(from as string);
      if (to) where.when.lte = new Date(to as string);
    }
    const events = await prisma.auditEvent.findMany({ where, orderBy: { when: 'asc' }, take: 10000 });

    const header = 'id,orgId,who,what,when,entityType,entityId,beforeStageKey,afterStageKey,policyId,policyVersion\n';
    const rows = events.map(e => [
      e.id, e.orgId,
      `"${e.who.replace(/"/g, '""')}"`,
      `"${e.what.replace(/"/g, '""')}"`,
      e.when.toISOString(),
      e.entityType ?? '',
      e.entityId ?? '',
      e.beforeStageKey ?? '',
      e.afterStageKey ?? '',
      e.policyId,
      e.policyVersion,
    ].join(',')).join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="audit-${req.auth.organizationId}-${Date.now()}.csv"`);
    res.send(header + rows);
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
});

export default router;
