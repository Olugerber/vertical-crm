import { Router } from 'express';
import { prisma } from '../db.js';
import { dispatch } from '../services/eventDispatcher.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const contacts = await prisma.contact.findMany({
      where: { orgId: req.auth.organizationId },
      orderBy: { id: 'asc' },
    });
    res.json(contacts);
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { accountId, email, phone, consentStatus, doNotContact } = req.body as {
      accountId: string;
      email?: string;
      phone?: string;
      consentStatus?: string;
      doNotContact?: boolean;
    };
    const contact = await prisma.contact.create({
      data: {
        orgId: req.auth.organizationId,
        accountId,
        email,
        phone,
        consentStatus: consentStatus ?? 'Unknown',
        doNotContact: doNotContact ?? false,
      },
    });
    res.json(contact);
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const contact = await prisma.contact.findFirst({
      where: { id: req.params['id'], orgId: req.auth.organizationId },
    });
    if (!contact) { res.status(404).json({ error: 'Not found' }); return; }
    res.json(contact);
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

router.post('/:id/consent', makeAction('compliance.consent_updated'));
router.post('/:id/dnc', makeAction('compliance.dnc_flagged'));
router.post('/:id/outbound', makeAction('compliance.outbound_attempted'));

export default router;
