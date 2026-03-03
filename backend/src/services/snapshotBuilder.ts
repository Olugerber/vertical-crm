import { prisma } from '../db.js';
import type { CrmStateSnapshots, AccountSnapshot, ContactSnapshot, OpportunitySnapshot, QuoteSnapshot, HandoffSnapshot, LeadSnapshot, AccountRiskFlag, StakeholderSnapshot, QuoteLineItem } from '../../../src/verticalCrm/CrmTypes.js';

export async function buildSnapshots(params: {
  organizationId: string;
  opportunityId?: string;
  contactId?: string;
  accountId?: string;
  quoteId?: string;
  handoffId?: string;
  leadId?: string;
}): Promise<CrmStateSnapshots> {
  const { organizationId, opportunityId, contactId, accountId, quoteId, handoffId, leadId } = params;

  let account: AccountSnapshot | undefined;
  let contact: ContactSnapshot | undefined;
  let opportunity: OpportunitySnapshot | undefined;
  let quote: QuoteSnapshot | undefined;
  let handoff: HandoffSnapshot | undefined;
  let lead: LeadSnapshot | undefined;

  // Load opportunity and its account
  if (opportunityId) {
    const opp = await prisma.opportunity.findUnique({ where: { id: opportunityId } });
    if (opp) {
      opportunity = {
        opportunityId: opp.id,
        accountId: opp.accountId,
        name: opp.name,
        amount: opp.amount,
        expectedCloseDate: opp.expectedCloseDate.toISOString(),
        stageKey: opp.stageKey,
        forecastCategory: opp.forecastCategory as OpportunitySnapshot['forecastCategory'],
        productLineItemIds: opp.productLineItemIds as string[],
        buyingCommittee: opp.buyingCommittee as StakeholderSnapshot[],
      };
      // Load account from opportunity
      const acc = await prisma.account.findUnique({ where: { id: opp.accountId } });
      if (acc) {
        account = {
          accountId: acc.id,
          legalName: acc.legalName,
          segment: acc.segment ?? undefined,
          territory: acc.territory ?? undefined,
          riskFlags: acc.riskFlags as AccountRiskFlag[],
          activeNdaOnFile: acc.activeNdaOnFile,
        };
      }
      // Load latest quote for this opportunity
      const q = await prisma.quote.findFirst({ where: { opportunityId }, orderBy: { id: 'desc' } });
      if (q) {
        quote = {
          quoteId: q.id,
          opportunityId: q.opportunityId,
          lineItems: q.lineItems as QuoteLineItem[],
          discountPercent: q.discountPercent,
          nonStandardTerms: q.nonStandardTerms as string[],
          approvalStatus: q.approvalStatus as QuoteSnapshot['approvalStatus'],
          marginPercent: q.marginPercent ?? undefined,
        };
      }
      // Load latest handoff
      const h = await prisma.handoff.findFirst({ where: { opportunityId }, orderBy: { id: 'desc' } });
      if (h) {
        handoff = {
          handoffId: h.id,
          opportunityId: h.opportunityId,
          scope: h.scope ?? undefined,
          billingDetails: h.billingDetails ?? undefined,
          startDate: h.startDate?.toISOString() ?? undefined,
          keyStakeholderIds: h.keyStakeholderIds as string[],
          completedChecklistItems: h.completedChecklistItems as string[],
          status: h.status as HandoffSnapshot['status'],
        };
      }
    }
  }

  // Load explicit accountId if no opp loaded it
  if (!account && accountId) {
    const acc = await prisma.account.findUnique({ where: { id: accountId } });
    if (acc) {
      account = {
        accountId: acc.id,
        legalName: acc.legalName,
        segment: acc.segment ?? undefined,
        territory: acc.territory ?? undefined,
        riskFlags: acc.riskFlags as AccountRiskFlag[],
        activeNdaOnFile: acc.activeNdaOnFile,
      };
    }
  }

  // Load contact
  if (contactId) {
    const c = await prisma.contact.findUnique({ where: { id: contactId } });
    if (c) {
      contact = {
        contactId: c.id,
        accountId: c.accountId,
        email: c.email ?? undefined,
        phone: c.phone ?? undefined,
        consentStatus: c.consentStatus as ContactSnapshot['consentStatus'],
        doNotContact: c.doNotContact,
        consentEvidence: c.consentEvidence as ContactSnapshot['consentEvidence'],
      };
      // Also load the account if not loaded
      if (!account) {
        const acc = await prisma.account.findUnique({ where: { id: c.accountId } });
        if (acc) {
          account = {
            accountId: acc.id,
            legalName: acc.legalName,
            segment: acc.segment ?? undefined,
            territory: acc.territory ?? undefined,
            riskFlags: acc.riskFlags as AccountRiskFlag[],
            activeNdaOnFile: acc.activeNdaOnFile,
          };
        }
      }
    }
  }

  // Load explicit quote
  if (quoteId && !quote) {
    const q = await prisma.quote.findUnique({ where: { id: quoteId } });
    if (q) {
      quote = {
        quoteId: q.id,
        opportunityId: q.opportunityId,
        lineItems: q.lineItems as QuoteLineItem[],
        discountPercent: q.discountPercent,
        nonStandardTerms: q.nonStandardTerms as string[],
        approvalStatus: q.approvalStatus as QuoteSnapshot['approvalStatus'],
        marginPercent: q.marginPercent ?? undefined,
      };
    }
  }

  // Load explicit handoff
  if (handoffId && !handoff) {
    const h = await prisma.handoff.findUnique({ where: { id: handoffId } });
    if (h) {
      handoff = {
        handoffId: h.id,
        opportunityId: h.opportunityId,
        scope: h.scope ?? undefined,
        billingDetails: h.billingDetails ?? undefined,
        startDate: h.startDate?.toISOString() ?? undefined,
        keyStakeholderIds: h.keyStakeholderIds as string[],
        completedChecklistItems: h.completedChecklistItems as string[],
        status: h.status as HandoffSnapshot['status'],
      };
      // Also load opportunity snapshot if not already loaded
      if (!opportunity) {
        const opp = await prisma.opportunity.findUnique({ where: { id: h.opportunityId } });
        if (opp) {
          opportunity = {
            opportunityId: opp.id,
            accountId: opp.accountId,
            name: opp.name,
            amount: opp.amount,
            expectedCloseDate: opp.expectedCloseDate.toISOString(),
            stageKey: opp.stageKey,
            forecastCategory: opp.forecastCategory as OpportunitySnapshot['forecastCategory'],
            productLineItemIds: opp.productLineItemIds as string[],
            buyingCommittee: opp.buyingCommittee as StakeholderSnapshot[],
          };
        }
      }
    }
  }

  // Load lead
  if (leadId) {
    const l = await prisma.lead.findUnique({ where: { id: leadId } });
    if (l) {
      lead = {
        leadId: l.id,
        source: l.source as LeadSnapshot['source'],
        status: l.status as LeadSnapshot['status'],
        assignedToUserId: l.assignedToUserId ?? undefined,
        qualificationChecklist: l.qualificationChecklist as LeadSnapshot['qualificationChecklist'],
      };
    }
  }

  return { account, contact, opportunity, quote, handoff, lead };
}
