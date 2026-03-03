import { Router } from 'express';
import { prisma } from '../db.js';
import { dispatch } from '../services/eventDispatcher.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const quotes = await prisma.quote.findMany({
      where: { opportunity: { orgId: req.auth.organizationId } },
      orderBy: { id: 'asc' },
    });
    res.json(quotes);
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const result = await dispatch({ eventType: 'quote.created', payload: req.body, organizationId: req.auth.organizationId, userId: req.auth.userId, roles: req.auth.roles });
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
    const quote = await prisma.quote.findFirst({
      where: { id: req.params['id'], opportunity: { orgId: req.auth.organizationId } },
    });
    if (!quote) { res.status(404).json({ error: 'Not found' }); return; }
    res.json(quote);
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

router.post('/:id/submit', makeAction('quote.submitted'));
router.post('/:id/approve', makeAction('quote.approved'));
router.post('/:id/reject', makeAction('quote.rejected'));

export default router;
