import { v4 as uuidv4 } from 'uuid';
import { prisma } from '../db.js';
import { loadPolicy } from './policyLoader.js';
import { buildSnapshots } from './snapshotBuilder.js';
import { ValidateCrmEvent } from '../../../src/verticalCrm/commands/ValidateCrmEvent.js';
import { ApplyCrmEvent } from '../../../src/verticalCrm/commands/ApplyCrmEvent.js';
import {
  LeadCreated, LeadAssigned, LeadQualified, LeadDisqualified, LeadConvertedToOpportunity,
  OpportunityCreated, StageTransitionRequested, OpportunityAmountUpdated,
  OpportunityClosedWonRequested, OpportunityClosedLost,
  ConsentUpdated, DoNotContactFlagged, OutboundAttempted, ComplianceOverrideRequested,
  QuoteCreated, QuoteSubmittedForApproval, QuoteApproved, QuoteRejected,
  HandoffGenerated, HandoffAccepted, HandoffRejected,
} from '../../../src/verticalCrm/CrmSubjects.js';
import type {
  ValidationObject, ApplicationObject, ValidationOutcome, ApplicationOutcome,
  OppRepository, QuoteRepository, AuditRepository, ConsentRepository,
  HandoffRepository, LeadRepository, AiRepository,
  NotificationPort, IntegrationPort, LlmPort,
  AuditEventRecord, ApprovalStatus, HandoffStatus, ConsentStatus, AiDraftArtifact, AiProposedUpdate,
} from '../../../src/verticalCrm/CrmTypes.js';

const validateCmd = new ValidateCrmEvent();
const applyCmd = new ApplyCrmEvent();

export interface DispatchInput {
  eventType: string;
  entityId?: string;
  payload: Record<string, unknown>;
  organizationId: string;
  userId: string;
  roles: string[];
}

export interface DispatchResult {
  validation: ValidationOutcome;
  application?: ApplicationOutcome;
  entity?: Record<string, unknown>;
}

// ─── Repo Implementations ─────────────────────────────────────────────────────

function makeOppRepo(): OppRepository {
  return {
    async updateStage(opportunityId, stageKey) {
      await prisma.opportunity.update({ where: { id: opportunityId }, data: { stageKey } });
    },
    async updateAmount(opportunityId, amount) {
      await prisma.opportunity.update({ where: { id: opportunityId }, data: { amount } });
    },
    async closeWon(opportunityId, contractRef) {
      await prisma.opportunity.update({ where: { id: opportunityId }, data: { stageKey: 'ClosedWon' } });
    },
    async closeLost(opportunityId, reason) {
      await prisma.opportunity.update({ where: { id: opportunityId }, data: { stageKey: 'ClosedLost' } });
    },
  };
}

function makeQuoteRepo(): QuoteRepository {
  return {
    async create(opportunityId) {
      const q = await prisma.quote.create({ data: { opportunityId } });
      return q.id;
    },
    async updateApprovalStatus(quoteId, status: ApprovalStatus) {
      await prisma.quote.update({ where: { id: quoteId }, data: { approvalStatus: status } });
    },
  };
}

function makeAuditRepo(orgId: string): AuditRepository {
  return {
    async record(event: AuditEventRecord) {
      const ae = await prisma.auditEvent.create({
        data: {
          orgId,
          who: event.who,
          what: event.what,
          when: new Date(event.when),
          beforeStageKey: event.beforeStageKey,
          afterStageKey: event.afterStageKey,
          policyVersion: event.policyVersion,
          policyId: event.policyId,
        },
      });
      return ae.id;
    },
  };
}

function makeConsentRepo(): ConsentRepository {
  return {
    async updateConsent(contactId, status: ConsentStatus, evidence) {
      await prisma.contact.update({
        where: { id: contactId },
        data: {
          consentStatus: status,
          consentEvidence: { timestamp: new Date().toISOString(), method: evidence.method, source: evidence.source },
        },
      });
    },
    async flagDoNotContact(contactId) {
      await prisma.contact.update({ where: { id: contactId }, data: { doNotContact: true } });
    },
    async recordOverride(contactId, approvedBy, justification) {
      // Persisted via audit log - no-op here
    },
  };
}

function makeHandoffRepo(): HandoffRepository {
  return {
    async create(opportunityId) {
      const h = await prisma.handoff.create({ data: { opportunityId } });
      return h.id;
    },
    async updateStatus(handoffId, status: HandoffStatus) {
      await prisma.handoff.update({ where: { id: handoffId }, data: { status } });
    },
  };
}

function makeLeadRepo(): LeadRepository {
  return {
    async assign(leadId, userId) {
      await prisma.lead.update({ where: { id: leadId }, data: { assignedToUserId: userId } });
    },
    async qualify(leadId) {
      await prisma.lead.update({ where: { id: leadId }, data: { status: 'Qualified' } });
    },
    async disqualify(leadId, reason) {
      await prisma.lead.update({ where: { id: leadId }, data: { status: 'Disqualified' } });
    },
    async convert(leadId, opportunityId) {
      await prisma.lead.update({ where: { id: leadId }, data: { status: 'Converted' } });
    },
  };
}

function makeAiRepo(orgId: string): AiRepository {
  return {
    async saveDraft(organizationId, artifact: AiDraftArtifact) {
      const d = await prisma.aiDraft.create({
        data: { orgId: organizationId, channel: artifact.channel, body: artifact.body, riskWarnings: artifact.riskWarnings as unknown as object[] },
      });
      return d.id;
    },
    async saveProposedUpdates(organizationId, updates: readonly AiProposedUpdate[]) {
      return uuidv4();
    },
    async recordSuggestionAccepted(suggestionId, approvedBy) {},
    async recordSuggestionRejected(suggestionId, rejectedBy) {},
  };
}

function makeNotificationPort(): NotificationPort {
  return {
    async notify(userId, message) { console.log(`[notify] → ${userId}: ${message}`); },
    async notifyRole(organizationId, role, message) { console.log(`[notify-role] → ${role} @ ${organizationId}: ${message}`); },
  };
}

function makeIntegrationPort(): IntegrationPort {
  return {
    async enqueue(action, payload) { console.log(`[integration] enqueue: ${action}`, payload); },
  };
}

function makeLlmPort(): LlmPort {
  return {
    async generate(promptKey, context) { return `[AI draft for ${promptKey}]`; },
  };
}

// ─── Main Dispatch Function ───────────────────────────────────────────────────

export async function dispatch(input: DispatchInput): Promise<DispatchResult> {
  const { eventType, entityId, payload, organizationId, userId, roles } = input;

  const verticalPolicy = await loadPolicy(organizationId);
  const actor = { userId, organizationId, roles };
  const eventId = uuidv4();
  const occurredAt = new Date().toISOString();

  // ─── Build Subject + load snapshots ────────────────────────────────────────

  switch (eventType) {
    // ── Lead Events ──────────────────────────────────────────────────────────

    case 'lead.created': {
      const source = payload.source as string;
      const leadId = entityId ?? uuidv4();
      const assignedToUserId = payload.assignedToUserId as string | undefined;
      const initialFields = (payload.initialFields as Record<string, string>) ?? {};

      // Create lead in DB first
      const lead = await prisma.lead.create({ data: { id: leadId, orgId: organizationId, source, assignedToUserId } });

      const subject = new LeadCreated(eventId, organizationId, occurredAt, leadId, source as any, assignedToUserId, initialFields);
      const snapshots = await buildSnapshots({ organizationId, leadId });
      const validationObj: ValidationObject = { actor, verticalPolicy, snapshots, requestedAction: eventType };
      const validation = validateCmd.run(subject, validationObj);

      if (!validation.allowed) return { validation, entity: { id: leadId } };

      const appObj: ApplicationObject = {
        validationResult: validation,
        repos: { opp: makeOppRepo(), quote: makeQuoteRepo(), audit: makeAuditRepo(organizationId), consent: makeConsentRepo(), handoff: makeHandoffRepo(), lead: makeLeadRepo(), ai: makeAiRepo(organizationId) },
        ports: { notifications: makeNotificationPort(), integrations: makeIntegrationPort(), llm: makeLlmPort() },
        validationContext: validationObj,
      };
      const application = await applyCmd.run(subject, appObj);
      return { validation, application, entity: { id: leadId } };
    }

    case 'lead.assigned': {
      const leadId = entityId!;
      const toUserId = payload.toUserId as string;
      const snapshots = await buildSnapshots({ organizationId, leadId });
      const fromUserId = snapshots.lead?.assignedToUserId;

      const subject = new LeadAssigned(eventId, organizationId, occurredAt, leadId, toUserId, fromUserId);
      const validationObj: ValidationObject = { actor, verticalPolicy, snapshots, requestedAction: eventType };
      const validation = validateCmd.run(subject, validationObj);

      if (!validation.allowed) return { validation, entity: snapshots.lead as unknown as Record<string, unknown> };

      const appObj: ApplicationObject = {
        validationResult: validation,
        repos: { opp: makeOppRepo(), quote: makeQuoteRepo(), audit: makeAuditRepo(organizationId), consent: makeConsentRepo(), handoff: makeHandoffRepo(), lead: makeLeadRepo(), ai: makeAiRepo(organizationId) },
        ports: { notifications: makeNotificationPort(), integrations: makeIntegrationPort(), llm: makeLlmPort() },
        validationContext: validationObj,
      };
      const application = await applyCmd.run(subject, appObj);
      const updated = await prisma.lead.findUnique({ where: { id: leadId } });
      return { validation, application, entity: updated as unknown as Record<string, unknown> };
    }

    case 'lead.qualified': {
      const leadId = entityId!;
      const qualifiedByUserId = userId;
      const qualificationChecklist = (payload.qualificationChecklist as any) ?? { framework: 'BANT', completedKeys: [] };
      const snapshots = await buildSnapshots({ organizationId, leadId });

      const subject = new LeadQualified(eventId, organizationId, occurredAt, leadId, qualificationChecklist, qualifiedByUserId);
      const validationObj: ValidationObject = { actor, verticalPolicy, snapshots, requestedAction: eventType };
      const validation = validateCmd.run(subject, validationObj);

      if (!validation.allowed) return { validation, entity: snapshots.lead as unknown as Record<string, unknown> };

      const appObj: ApplicationObject = {
        validationResult: validation,
        repos: { opp: makeOppRepo(), quote: makeQuoteRepo(), audit: makeAuditRepo(organizationId), consent: makeConsentRepo(), handoff: makeHandoffRepo(), lead: makeLeadRepo(), ai: makeAiRepo(organizationId) },
        ports: { notifications: makeNotificationPort(), integrations: makeIntegrationPort(), llm: makeLlmPort() },
        validationContext: validationObj,
      };
      const application = await applyCmd.run(subject, appObj);
      const updated = await prisma.lead.findUnique({ where: { id: leadId } });
      return { validation, application, entity: updated as unknown as Record<string, unknown> };
    }

    case 'lead.disqualified': {
      const leadId = entityId!;
      const reason = payload.reason as string;
      const snapshots = await buildSnapshots({ organizationId, leadId });

      const subject = new LeadDisqualified(eventId, organizationId, occurredAt, leadId, reason, userId);
      const validationObj: ValidationObject = { actor, verticalPolicy, snapshots, requestedAction: eventType };
      const validation = validateCmd.run(subject, validationObj);

      if (!validation.allowed) return { validation, entity: snapshots.lead as unknown as Record<string, unknown> };

      const appObj: ApplicationObject = {
        validationResult: validation,
        repos: { opp: makeOppRepo(), quote: makeQuoteRepo(), audit: makeAuditRepo(organizationId), consent: makeConsentRepo(), handoff: makeHandoffRepo(), lead: makeLeadRepo(), ai: makeAiRepo(organizationId) },
        ports: { notifications: makeNotificationPort(), integrations: makeIntegrationPort(), llm: makeLlmPort() },
        validationContext: validationObj,
      };
      const application = await applyCmd.run(subject, appObj);
      const updated = await prisma.lead.findUnique({ where: { id: leadId } });
      return { validation, application, entity: updated as unknown as Record<string, unknown> };
    }

    case 'lead.converted': {
      const leadId = entityId!;
      const opportunityId = payload.opportunityId as string ?? uuidv4();
      const qualificationChecklist = (payload.qualificationChecklist as any) ?? { framework: 'BANT', completedKeys: [] };
      const snapshots = await buildSnapshots({ organizationId, leadId });

      const subject = new LeadConvertedToOpportunity(eventId, organizationId, occurredAt, leadId, opportunityId, qualificationChecklist, userId);
      const validationObj: ValidationObject = { actor, verticalPolicy, snapshots, requestedAction: eventType };
      const validation = validateCmd.run(subject, validationObj);

      if (!validation.allowed) return { validation, entity: snapshots.lead as unknown as Record<string, unknown> };

      const appObj: ApplicationObject = {
        validationResult: validation,
        repos: { opp: makeOppRepo(), quote: makeQuoteRepo(), audit: makeAuditRepo(organizationId), consent: makeConsentRepo(), handoff: makeHandoffRepo(), lead: makeLeadRepo(), ai: makeAiRepo(organizationId) },
        ports: { notifications: makeNotificationPort(), integrations: makeIntegrationPort(), llm: makeLlmPort() },
        validationContext: validationObj,
      };
      const application = await applyCmd.run(subject, appObj);
      const updated = await prisma.lead.findUnique({ where: { id: leadId } });
      return { validation, application, entity: updated as unknown as Record<string, unknown> };
    }

    // ── Opportunity Events ───────────────────────────────────────────────────

    case 'opportunity.created': {
      const opportunityId = entityId ?? uuidv4();
      const accountId = payload.accountId as string;
      const name = payload.name as string;
      const amount = payload.amount as number;
      const expectedCloseDate = payload.expectedCloseDate as string;
      const forecastCategory = (payload.forecastCategory as string) ?? 'Pipeline';

      const snapshots = await buildSnapshots({ organizationId, accountId });

      const subject = new OpportunityCreated(eventId, organizationId, occurredAt, opportunityId, accountId, name, amount, expectedCloseDate, forecastCategory as any, userId);
      const validationObj: ValidationObject = { actor, verticalPolicy, snapshots, requestedAction: eventType };
      const validation = validateCmd.run(subject, validationObj);

      if (!validation.allowed) return { validation };

      // Create the opportunity
      const opp = await prisma.opportunity.create({
        data: { id: opportunityId, orgId: organizationId, accountId, name, amount, expectedCloseDate: new Date(expectedCloseDate), forecastCategory },
      });

      const appObj: ApplicationObject = {
        validationResult: validation,
        repos: { opp: makeOppRepo(), quote: makeQuoteRepo(), audit: makeAuditRepo(organizationId), consent: makeConsentRepo(), handoff: makeHandoffRepo(), lead: makeLeadRepo(), ai: makeAiRepo(organizationId) },
        ports: { notifications: makeNotificationPort(), integrations: makeIntegrationPort(), llm: makeLlmPort() },
        validationContext: validationObj,
      };
      const application = await applyCmd.run(subject, appObj);
      return { validation, application, entity: opp as unknown as Record<string, unknown> };
    }

    case 'opportunity.stage_transition': {
      const opportunityId = entityId!;
      const toStageKey = payload.toStageKey as string;
      const providedFields = (payload.providedFields as Record<string, string>) ?? {};
      const snapshots = await buildSnapshots({ organizationId, opportunityId });
      const fromStageKey = snapshots.opportunity?.stageKey ?? 'Prospect';

      const subject = new StageTransitionRequested(eventId, organizationId, occurredAt, opportunityId, fromStageKey, toStageKey, userId, providedFields);
      const validationObj: ValidationObject = { actor, verticalPolicy, snapshots, requestedAction: eventType, requestedStageKey: toStageKey };
      const validation = validateCmd.run(subject, validationObj);

      if (!validation.allowed) return { validation, entity: snapshots.opportunity as unknown as Record<string, unknown> };

      const appObj: ApplicationObject = {
        validationResult: validation,
        repos: { opp: makeOppRepo(), quote: makeQuoteRepo(), audit: makeAuditRepo(organizationId), consent: makeConsentRepo(), handoff: makeHandoffRepo(), lead: makeLeadRepo(), ai: makeAiRepo(organizationId) },
        ports: { notifications: makeNotificationPort(), integrations: makeIntegrationPort(), llm: makeLlmPort() },
        validationContext: validationObj,
      };
      const application = await applyCmd.run(subject, appObj);
      const updated = await prisma.opportunity.findUnique({ where: { id: opportunityId } });
      return { validation, application, entity: updated as unknown as Record<string, unknown> };
    }

    case 'opportunity.close_won': {
      const opportunityId = entityId!;
      const contractRef = payload.contractRef as string | undefined;
      const purchaseOrderRef = payload.purchaseOrderRef as string | undefined;
      const snapshots = await buildSnapshots({ organizationId, opportunityId });

      const subject = new OpportunityClosedWonRequested(eventId, organizationId, occurredAt, opportunityId, userId, contractRef, purchaseOrderRef);
      const validationObj: ValidationObject = { actor, verticalPolicy, snapshots, requestedAction: eventType };
      const validation = validateCmd.run(subject, validationObj);

      if (!validation.allowed) return { validation, entity: snapshots.opportunity as unknown as Record<string, unknown> };

      const appObj: ApplicationObject = {
        validationResult: validation,
        repos: { opp: makeOppRepo(), quote: makeQuoteRepo(), audit: makeAuditRepo(organizationId), consent: makeConsentRepo(), handoff: makeHandoffRepo(), lead: makeLeadRepo(), ai: makeAiRepo(organizationId) },
        ports: { notifications: makeNotificationPort(), integrations: makeIntegrationPort(), llm: makeLlmPort() },
        validationContext: validationObj,
      };
      const application = await applyCmd.run(subject, appObj);
      const updated = await prisma.opportunity.findUnique({ where: { id: opportunityId } });
      return { validation, application, entity: updated as unknown as Record<string, unknown> };
    }

    case 'opportunity.close_lost': {
      const opportunityId = entityId!;
      const reason = payload.reason as string;
      const competitorKey = payload.competitorKey as string | undefined;
      const snapshots = await buildSnapshots({ organizationId, opportunityId });

      const subject = new OpportunityClosedLost(eventId, organizationId, occurredAt, opportunityId, reason, competitorKey, userId);
      const validationObj: ValidationObject = { actor, verticalPolicy, snapshots, requestedAction: eventType };
      const validation = validateCmd.run(subject, validationObj);

      if (!validation.allowed) return { validation, entity: snapshots.opportunity as unknown as Record<string, unknown> };

      const appObj: ApplicationObject = {
        validationResult: validation,
        repos: { opp: makeOppRepo(), quote: makeQuoteRepo(), audit: makeAuditRepo(organizationId), consent: makeConsentRepo(), handoff: makeHandoffRepo(), lead: makeLeadRepo(), ai: makeAiRepo(organizationId) },
        ports: { notifications: makeNotificationPort(), integrations: makeIntegrationPort(), llm: makeLlmPort() },
        validationContext: validationObj,
      };
      const application = await applyCmd.run(subject, appObj);
      const updated = await prisma.opportunity.findUnique({ where: { id: opportunityId } });
      return { validation, application, entity: updated as unknown as Record<string, unknown> };
    }

    // ── Compliance Events ────────────────────────────────────────────────────

    case 'compliance.consent_updated': {
      const contactId = entityId!;
      const newStatus = payload.newStatus as string;
      const method = payload.method as string;
      const source = payload.source as string;
      const snapshots = await buildSnapshots({ organizationId, contactId });
      const accountId = snapshots.contact?.accountId ?? '';

      const subject = new ConsentUpdated(eventId, organizationId, occurredAt, contactId, accountId, newStatus as any, method, source, userId);
      const validationObj: ValidationObject = { actor, verticalPolicy, snapshots, requestedAction: eventType };
      const validation = validateCmd.run(subject, validationObj);

      if (!validation.allowed) return { validation, entity: snapshots.contact as unknown as Record<string, unknown> };

      const appObj: ApplicationObject = {
        validationResult: validation,
        repos: { opp: makeOppRepo(), quote: makeQuoteRepo(), audit: makeAuditRepo(organizationId), consent: makeConsentRepo(), handoff: makeHandoffRepo(), lead: makeLeadRepo(), ai: makeAiRepo(organizationId) },
        ports: { notifications: makeNotificationPort(), integrations: makeIntegrationPort(), llm: makeLlmPort() },
        validationContext: validationObj,
      };
      const application = await applyCmd.run(subject, appObj);
      const updated = await prisma.contact.findUnique({ where: { id: contactId } });
      return { validation, application, entity: updated as unknown as Record<string, unknown> };
    }

    case 'compliance.dnc_flagged': {
      const contactId = entityId!;
      const reason = payload.reason as string | undefined;
      const snapshots = await buildSnapshots({ organizationId, contactId });
      const accountId = snapshots.contact?.accountId ?? '';

      const subject = new DoNotContactFlagged(eventId, organizationId, occurredAt, contactId, accountId, userId, reason);
      const validationObj: ValidationObject = { actor, verticalPolicy, snapshots, requestedAction: eventType };
      const validation = validateCmd.run(subject, validationObj);

      if (!validation.allowed) return { validation, entity: snapshots.contact as unknown as Record<string, unknown> };

      const appObj: ApplicationObject = {
        validationResult: validation,
        repos: { opp: makeOppRepo(), quote: makeQuoteRepo(), audit: makeAuditRepo(organizationId), consent: makeConsentRepo(), handoff: makeHandoffRepo(), lead: makeLeadRepo(), ai: makeAiRepo(organizationId) },
        ports: { notifications: makeNotificationPort(), integrations: makeIntegrationPort(), llm: makeLlmPort() },
        validationContext: validationObj,
      };
      const application = await applyCmd.run(subject, appObj);
      const updated = await prisma.contact.findUnique({ where: { id: contactId } });
      return { validation, application, entity: updated as unknown as Record<string, unknown> };
    }

    case 'compliance.outbound_attempted': {
      const contactId = entityId!;
      const channel = payload.channel as any;
      const opportunityId = payload.opportunityId as string | undefined;
      const snapshots = await buildSnapshots({ organizationId, contactId });
      const accountId = snapshots.contact?.accountId ?? '';

      const subject = new OutboundAttempted(eventId, organizationId, occurredAt, contactId, accountId, channel, userId, opportunityId);
      const validationObj: ValidationObject = { actor, verticalPolicy, snapshots, requestedAction: eventType, requestedChannel: channel };
      const validation = validateCmd.run(subject, validationObj);

      if (!validation.allowed) return { validation, entity: snapshots.contact as unknown as Record<string, unknown> };

      const appObj: ApplicationObject = {
        validationResult: validation,
        repos: { opp: makeOppRepo(), quote: makeQuoteRepo(), audit: makeAuditRepo(organizationId), consent: makeConsentRepo(), handoff: makeHandoffRepo(), lead: makeLeadRepo(), ai: makeAiRepo(organizationId) },
        ports: { notifications: makeNotificationPort(), integrations: makeIntegrationPort(), llm: makeLlmPort() },
        validationContext: validationObj,
      };
      const application = await applyCmd.run(subject, appObj);
      return { validation, application, entity: snapshots.contact as unknown as Record<string, unknown> };
    }

    // ── Quote Events ─────────────────────────────────────────────────────────

    case 'quote.created': {
      const quoteId = entityId ?? uuidv4();
      const opportunityId = payload.opportunityId as string;
      const snapshots = await buildSnapshots({ organizationId, opportunityId });

      const subject = new QuoteCreated(eventId, organizationId, occurredAt, quoteId, opportunityId, userId);
      const validationObj: ValidationObject = { actor, verticalPolicy, snapshots, requestedAction: eventType };
      const validation = validateCmd.run(subject, validationObj);

      if (!validation.allowed) return { validation };

      const quote = await prisma.quote.create({ data: { id: quoteId, opportunityId } });

      const appObj: ApplicationObject = {
        validationResult: validation,
        repos: { opp: makeOppRepo(), quote: makeQuoteRepo(), audit: makeAuditRepo(organizationId), consent: makeConsentRepo(), handoff: makeHandoffRepo(), lead: makeLeadRepo(), ai: makeAiRepo(organizationId) },
        ports: { notifications: makeNotificationPort(), integrations: makeIntegrationPort(), llm: makeLlmPort() },
        validationContext: validationObj,
      };
      const application = await applyCmd.run(subject, appObj);
      return { validation, application, entity: quote as unknown as Record<string, unknown> };
    }

    case 'quote.submitted': {
      const quoteId = entityId!;
      const quote = await prisma.quote.findUnique({ where: { id: quoteId } });
      if (!quote) throw new Error(`Quote ${quoteId} not found`);
      const snapshots = await buildSnapshots({ organizationId, quoteId, opportunityId: quote.opportunityId });

      const subject = new QuoteSubmittedForApproval(eventId, organizationId, occurredAt, quoteId, quote.opportunityId, userId);
      const validationObj: ValidationObject = { actor, verticalPolicy, snapshots, requestedAction: eventType };
      const validation = validateCmd.run(subject, validationObj);

      if (!validation.allowed) return { validation, entity: quote as unknown as Record<string, unknown> };

      const appObj: ApplicationObject = {
        validationResult: validation,
        repos: { opp: makeOppRepo(), quote: makeQuoteRepo(), audit: makeAuditRepo(organizationId), consent: makeConsentRepo(), handoff: makeHandoffRepo(), lead: makeLeadRepo(), ai: makeAiRepo(organizationId) },
        ports: { notifications: makeNotificationPort(), integrations: makeIntegrationPort(), llm: makeLlmPort() },
        validationContext: validationObj,
      };
      const application = await applyCmd.run(subject, appObj);
      const updated = await prisma.quote.findUnique({ where: { id: quoteId } });
      return { validation, application, entity: updated as unknown as Record<string, unknown> };
    }

    case 'quote.approved': {
      const quoteId = entityId!;
      const quote = await prisma.quote.findUnique({ where: { id: quoteId } });
      if (!quote) throw new Error(`Quote ${quoteId} not found`);
      const snapshots = await buildSnapshots({ organizationId, quoteId, opportunityId: quote.opportunityId });

      const subject = new QuoteApproved(eventId, organizationId, occurredAt, quoteId, quote.opportunityId, userId);
      const validationObj: ValidationObject = { actor, verticalPolicy, snapshots, requestedAction: eventType };
      const validation = validateCmd.run(subject, validationObj);

      if (!validation.allowed) return { validation, entity: quote as unknown as Record<string, unknown> };

      const appObj: ApplicationObject = {
        validationResult: validation,
        repos: { opp: makeOppRepo(), quote: makeQuoteRepo(), audit: makeAuditRepo(organizationId), consent: makeConsentRepo(), handoff: makeHandoffRepo(), lead: makeLeadRepo(), ai: makeAiRepo(organizationId) },
        ports: { notifications: makeNotificationPort(), integrations: makeIntegrationPort(), llm: makeLlmPort() },
        validationContext: validationObj,
      };
      const application = await applyCmd.run(subject, appObj);
      const updated = await prisma.quote.findUnique({ where: { id: quoteId } });
      return { validation, application, entity: updated as unknown as Record<string, unknown> };
    }

    case 'quote.rejected': {
      const quoteId = entityId!;
      const reason = payload.reason as string;
      const quote = await prisma.quote.findUnique({ where: { id: quoteId } });
      if (!quote) throw new Error(`Quote ${quoteId} not found`);
      const snapshots = await buildSnapshots({ organizationId, quoteId, opportunityId: quote.opportunityId });

      const subject = new QuoteRejected(eventId, organizationId, occurredAt, quoteId, quote.opportunityId, userId, reason);
      const validationObj: ValidationObject = { actor, verticalPolicy, snapshots, requestedAction: eventType };
      const validation = validateCmd.run(subject, validationObj);

      if (!validation.allowed) return { validation, entity: quote as unknown as Record<string, unknown> };

      const appObj: ApplicationObject = {
        validationResult: validation,
        repos: { opp: makeOppRepo(), quote: makeQuoteRepo(), audit: makeAuditRepo(organizationId), consent: makeConsentRepo(), handoff: makeHandoffRepo(), lead: makeLeadRepo(), ai: makeAiRepo(organizationId) },
        ports: { notifications: makeNotificationPort(), integrations: makeIntegrationPort(), llm: makeLlmPort() },
        validationContext: validationObj,
      };
      const application = await applyCmd.run(subject, appObj);
      const updated = await prisma.quote.findUnique({ where: { id: quoteId } });
      return { validation, application, entity: updated as unknown as Record<string, unknown> };
    }

    // ── Handoff Events ───────────────────────────────────────────────────────

    case 'handoff.generated': {
      const handoffId = entityId ?? uuidv4();
      const opportunityId = payload.opportunityId as string;
      const snapshots = await buildSnapshots({ organizationId, opportunityId });

      const subject = new HandoffGenerated(eventId, organizationId, occurredAt, handoffId, opportunityId, userId);
      const validationObj: ValidationObject = { actor, verticalPolicy, snapshots, requestedAction: eventType };
      const validation = validateCmd.run(subject, validationObj);

      if (!validation.allowed) return { validation };

      const handoff = await prisma.handoff.create({ data: { id: handoffId, opportunityId } });

      const appObj: ApplicationObject = {
        validationResult: validation,
        repos: { opp: makeOppRepo(), quote: makeQuoteRepo(), audit: makeAuditRepo(organizationId), consent: makeConsentRepo(), handoff: makeHandoffRepo(), lead: makeLeadRepo(), ai: makeAiRepo(organizationId) },
        ports: { notifications: makeNotificationPort(), integrations: makeIntegrationPort(), llm: makeLlmPort() },
        validationContext: validationObj,
      };
      const application = await applyCmd.run(subject, appObj);
      return { validation, application, entity: handoff as unknown as Record<string, unknown> };
    }

    case 'handoff.accepted': {
      const handoffId = entityId!;
      const handoff = await prisma.handoff.findUnique({ where: { id: handoffId } });
      if (!handoff) throw new Error(`Handoff ${handoffId} not found`);
      const snapshots = await buildSnapshots({ organizationId, handoffId, opportunityId: handoff.opportunityId });

      const subject = new HandoffAccepted(eventId, organizationId, occurredAt, handoffId, handoff.opportunityId, userId);
      const validationObj: ValidationObject = { actor, verticalPolicy, snapshots, requestedAction: eventType };
      const validation = validateCmd.run(subject, validationObj);

      if (!validation.allowed) return { validation, entity: handoff as unknown as Record<string, unknown> };

      const appObj: ApplicationObject = {
        validationResult: validation,
        repos: { opp: makeOppRepo(), quote: makeQuoteRepo(), audit: makeAuditRepo(organizationId), consent: makeConsentRepo(), handoff: makeHandoffRepo(), lead: makeLeadRepo(), ai: makeAiRepo(organizationId) },
        ports: { notifications: makeNotificationPort(), integrations: makeIntegrationPort(), llm: makeLlmPort() },
        validationContext: validationObj,
      };
      const application = await applyCmd.run(subject, appObj);
      const updated = await prisma.handoff.findUnique({ where: { id: handoffId } });
      return { validation, application, entity: updated as unknown as Record<string, unknown> };
    }

    case 'handoff.rejected': {
      const handoffId = entityId!;
      const reason = payload.reason as string;
      const handoff = await prisma.handoff.findUnique({ where: { id: handoffId } });
      if (!handoff) throw new Error(`Handoff ${handoffId} not found`);
      const snapshots = await buildSnapshots({ organizationId, handoffId, opportunityId: handoff.opportunityId });

      const subject = new HandoffRejected(eventId, organizationId, occurredAt, handoffId, handoff.opportunityId, userId, reason);
      const validationObj: ValidationObject = { actor, verticalPolicy, snapshots, requestedAction: eventType };
      const validation = validateCmd.run(subject, validationObj);

      if (!validation.allowed) return { validation, entity: handoff as unknown as Record<string, unknown> };

      const appObj: ApplicationObject = {
        validationResult: validation,
        repos: { opp: makeOppRepo(), quote: makeQuoteRepo(), audit: makeAuditRepo(organizationId), consent: makeConsentRepo(), handoff: makeHandoffRepo(), lead: makeLeadRepo(), ai: makeAiRepo(organizationId) },
        ports: { notifications: makeNotificationPort(), integrations: makeIntegrationPort(), llm: makeLlmPort() },
        validationContext: validationObj,
      };
      const application = await applyCmd.run(subject, appObj);
      const updated = await prisma.handoff.findUnique({ where: { id: handoffId } });
      return { validation, application, entity: updated as unknown as Record<string, unknown> };
    }

    default:
      throw new Error(`Unknown event type: ${eventType}`);
  }
}
