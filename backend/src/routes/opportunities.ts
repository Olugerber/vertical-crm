import { Router } from 'express';
import { prisma } from '../db.js';
import { dispatch } from '../services/eventDispatcher.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const opportunities = await prisma.opportunity.findMany({
      where: { orgId: req.auth.organizationId },
      orderBy: { id: 'asc' },
      include: { account: true, quotes: true, handoffs: true },
    });
    res.json(opportunities);
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const result = await dispatch({ eventType: 'opportunity.created', payload: req.body, organizationId: req.auth.organizationId, userId: req.auth.userId, roles: req.auth.roles });
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
    const opportunity = await prisma.opportunity.findFirst({
      where: { id: req.params['id'], orgId: req.auth.organizationId },
      include: { account: true, quotes: true, handoffs: true },
    });
    if (!opportunity) { res.status(404).json({ error: 'Not found' }); return; }
    res.json(opportunity);
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

router.post('/:id/transition', makeAction('opportunity.stage_transition'));
router.post('/:id/close-won', makeAction('opportunity.close_won'));
router.post('/:id/close-lost', makeAction('opportunity.close_lost'));

export default router;
