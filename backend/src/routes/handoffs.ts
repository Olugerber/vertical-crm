import { Router } from 'express';
import { prisma } from '../db.js';
import { dispatch } from '../services/eventDispatcher.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const handoffs = await prisma.handoff.findMany({
      where: { opportunity: { orgId: req.auth.organizationId } },
      orderBy: { id: 'asc' },
    });
    res.json(handoffs);
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const result = await dispatch({ eventType: 'handoff.generated', payload: req.body, organizationId: req.auth.organizationId, userId: req.auth.userId, roles: req.auth.roles });
    if (!result.validation.allowed) {
      res.status(422).json({ success: false, blockedReasons: result.validation.blockedReasons, missingFields: result.validation.missingFields, requiredApprovals: result.validation.requiredApprovals });
      return;
    }
    res.json({ success: true, validation: result.validation, application: result.application, entity: result.entity });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const handoff = await prisma.handoff.findFirst({
      where: { id: req.params['id'], opportunity: { orgId: req.auth.organizationId } },
    });
    if (!handoff) { res.status(404).json({ error: 'Not found' }); return; }
    res.json(handoff);
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
});

function makeAction(eventType: string) {
  return async (req: any, res: any) => {
    try {
      const result = await dispatch({ eventType, entityId: req.params['id'], payload: req.body, organizationId: req.auth.organizationId, userId: req.auth.userId, roles: req.auth.roles });
      if (!result.validation.allowed) {
        res.status(422).json({ success: false, blockedReasons: result.validation.blockedReasons, missingFields: result.validation.missingFields, requiredApprovals: result.validation.requiredApprovals });
        return;
      }
      res.json({ success: true, validation: result.validation, application: result.application, entity: result.entity });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message });
    }
  };
}

router.post('/:id/accept', makeAction('handoff.accepted'));
router.post('/:id/reject', makeAction('handoff.rejected'));

export default router;
