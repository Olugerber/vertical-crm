/**
 * verticalCrm — ApplyCrmEvent Command
 *
 * Commits validated CRM events: mutates canonical state, writes immutable
 * audit records, and enqueues side-effects (notifications, integrations).
 *
 * Design invariants:
 *   - Forbidden if validation is blocked: every strategy begins by asserting
 *     validationResult.allowed === true and throws otherwise.
 *   - Every applied event produces at least one immutable audit record
 *     bearing: who, what, when, before/after stage, policyVersion, policyId.
 *   - No numbers or state are invented: all mutations derive from Subject payloads
 *     and canonical snapshots provided via the ApplicationObject.
 *   - AI suggestion acceptance writes audit events with AI provenance metadata.
 *
 * @module verticalCrm/commands/ApplyCrmEvent
 */

import { Command } from "codascon";
import type { Template } from "codascon";
import type {
  CrmEvent,
  ApplicationObject,
  ApplicationOutcome,
  AuditEventRecord,
} from "../CrmTypes.js";
import {
  LeadCreated,
  LeadAssigned,
  LeadQualified,
  LeadDisqualified,
  LeadConvertedToOpportunity,
  OpportunityCreated,
  StageTransitionRequested,
  OpportunityAmountUpdated,
  OpportunityClosedWonRequested,
  OpportunityClosedLost,
  ConsentUpdated,
  DoNotContactFlagged,
  OutboundAttempted,
  ComplianceOverrideRequested,
  QuoteCreated,
  QuoteSubmittedForApproval,
  QuoteApproved,
  QuoteRejected,
  HandoffGenerated,
  HandoffAccepted,
  HandoffRejected,
} from "../CrmSubjects.js";
import {
  AiDraftRequested,
  AiNotesIngested,
  AiProposedUpdatesGenerated,
  AiSuggestionAccepted,
  AiSuggestionRejected,
  AiDealBriefRequested,
  AiPipelineSummaryRequested,
  AiHygieneScanRequested,
} from "../AiSubjects.js";

// ─── Subject Union Aliases ────────────────────────────────────────────────────

type LeadSubjectUnion =
  | LeadCreated
  | LeadAssigned
  | LeadQualified
  | LeadDisqualified
  | LeadConvertedToOpportunity;

type OppSubjectUnion =
  | OpportunityCreated
  | StageTransitionRequested
  | OpportunityAmountUpdated
  | OpportunityClosedWonRequested
  | OpportunityClosedLost;

type ComplianceSubjectUnion =
  | ConsentUpdated
  | DoNotContactFlagged
  | OutboundAttempted
  | ComplianceOverrideRequested;

type QuoteSubjectUnion =
  | QuoteCreated
  | QuoteSubmittedForApproval
  | QuoteApproved
  | QuoteRejected;

type HandoffSubjectUnion = HandoffGenerated | HandoffAccepted | HandoffRejected;

type AiSubjectUnion =
  | AiDraftRequested
  | AiNotesIngested
  | AiProposedUpdatesGenerated
  | AiSuggestionAccepted
  | AiSuggestionRejected
  | AiDealBriefRequested
  | AiPipelineSummaryRequested
  | AiHygieneScanRequested;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function assertAllowed(object: Readonly<ApplicationObject>): void {
  if (!object.validationResult.allowed) {
    throw new Error(
      "ApplyCrmEvent is forbidden: the associated ValidateCrmEvent result was not allowed. " +
        "Blocked reasons: " +
        object.validationResult.blockedReasons.map((r) => r.code).join(", "),
    );
  }
}

function auditBase(
  object: Readonly<ApplicationObject>,
  what: string,
  extra: Partial<AuditEventRecord> = {},
): Omit<AuditEventRecord, never> {
  const policy = object.validationContext.verticalPolicy!;
  return {
    who: object.validationContext.actor.userId,
    what,
    when: new Date().toISOString(),
    policyVersion: policy.version,
    policyId: policy.verticalPolicyId,
    ...extra,
  };
}

async function recordAndReturn(
  object: Readonly<ApplicationObject>,
  auditEvent: AuditEventRecord,
  updatedIds: Record<string, string> = {},
  queuedActions: string[] = [],
): Promise<ApplicationOutcome> {
  const auditEventId = await object.repos.audit.record(auditEvent);
  return {
    updatedIds,
    auditEventIds: [auditEventId],
    queuedActions,
  };
}

// ─── Abstract Template: Lead Events ──────────────────────────────────────────

abstract class LeadApplicationTemplate<SU extends LeadSubjectUnion>
  implements Template<ApplyCrmEvent, [], SU>
{
  execute<T extends SU>(subject: T, object: Readonly<ApplicationObject>): Promise<ApplicationOutcome> {
    assertAllowed(object);
    return this.doApply(subject, object);
  }

  protected abstract doApply(
    subject: SU,
    object: Readonly<ApplicationObject>,
  ): Promise<ApplicationOutcome>;
}

// ─── Lead Strategies ─────────────────────────────────────────────────────────

class ApplyLeadCreated extends LeadApplicationTemplate<LeadCreated> {
  protected async doApply(
    subject: LeadCreated,
    object: Readonly<ApplicationObject>,
  ): Promise<ApplicationOutcome> {
    return recordAndReturn(
      object,
      auditBase(object, `Lead created: ${subject.leadId} from source ${subject.source}`),
      { leadId: subject.leadId },
    );
  }
}

class ApplyLeadAssigned extends LeadApplicationTemplate<LeadAssigned> {
  protected async doApply(
    subject: LeadAssigned,
    object: Readonly<ApplicationObject>,
  ): Promise<ApplicationOutcome> {
    await object.repos.lead.assign(subject.leadId, subject.toUserId);
    await object.ports.notifications.notify(
      subject.toUserId,
      `Lead ${subject.leadId} has been assigned to you.`,
    );
    return recordAndReturn(
      object,
      auditBase(object, `Lead ${subject.leadId} assigned to user ${subject.toUserId}`),
      { leadId: subject.leadId },
      ["notify:assignee"],
    );
  }
}

class ApplyLeadQualified extends LeadApplicationTemplate<LeadQualified> {
  protected async doApply(
    subject: LeadQualified,
    object: Readonly<ApplicationObject>,
  ): Promise<ApplicationOutcome> {
    await object.repos.lead.qualify(subject.leadId);
    return recordAndReturn(
      object,
      auditBase(object, `Lead ${subject.leadId} qualified`),
      { leadId: subject.leadId },
    );
  }
}

class ApplyLeadDisqualified extends LeadApplicationTemplate<LeadDisqualified> {
  protected async doApply(
    subject: LeadDisqualified,
    object: Readonly<ApplicationObject>,
  ): Promise<ApplicationOutcome> {
    await object.repos.lead.disqualify(subject.leadId, subject.reason);
    return recordAndReturn(
      object,
      auditBase(object, `Lead ${subject.leadId} disqualified: ${subject.reason}`),
      { leadId: subject.leadId },
    );
  }
}

class ApplyLeadConverted extends LeadApplicationTemplate<LeadConvertedToOpportunity> {
  protected async doApply(
    subject: LeadConvertedToOpportunity,
    object: Readonly<ApplicationObject>,
  ): Promise<ApplicationOutcome> {
    await object.repos.lead.convert(subject.leadId, subject.opportunityId);
    return recordAndReturn(
      object,
      auditBase(object, `Lead ${subject.leadId} converted to opportunity ${subject.opportunityId}`),
      { leadId: subject.leadId, opportunityId: subject.opportunityId },
    );
  }
}

// ─── Abstract Template: Opportunity Events ────────────────────────────────────

abstract class OpportunityApplicationTemplate<SU extends OppSubjectUnion>
  implements Template<ApplyCrmEvent, [], SU>
{
  execute<T extends SU>(subject: T, object: Readonly<ApplicationObject>): Promise<ApplicationOutcome> {
    assertAllowed(object);
    return this.doApply(subject, object);
  }

  protected abstract doApply(
    subject: SU,
    object: Readonly<ApplicationObject>,
  ): Promise<ApplicationOutcome>;
}

// ─── Opportunity Strategies ───────────────────────────────────────────────────

class ApplyOpportunityCreated extends OpportunityApplicationTemplate<OpportunityCreated> {
  protected async doApply(
    subject: OpportunityCreated,
    object: Readonly<ApplicationObject>,
  ): Promise<ApplicationOutcome> {
    return recordAndReturn(
      object,
      auditBase(object, `Opportunity created: ${subject.opportunityId} (${subject.name})`),
      { opportunityId: subject.opportunityId },
    );
  }
}

class ApplyStageTransition extends OpportunityApplicationTemplate<StageTransitionRequested> {
  protected async doApply(
    subject: StageTransitionRequested,
    object: Readonly<ApplicationObject>,
  ): Promise<ApplicationOutcome> {
    await object.repos.opp.updateStage(subject.opportunityId, subject.toStageKey);
    return recordAndReturn(
      object,
      auditBase(object, `Opportunity ${subject.opportunityId} stage transition: ${subject.fromStageKey} → ${subject.toStageKey}`, {
        beforeStageKey: subject.fromStageKey,
        afterStageKey: subject.toStageKey,
      }),
      { opportunityId: subject.opportunityId },
    );
  }
}

class ApplyAmountUpdate extends OpportunityApplicationTemplate<OpportunityAmountUpdated> {
  protected async doApply(
    subject: OpportunityAmountUpdated,
    object: Readonly<ApplicationObject>,
  ): Promise<ApplicationOutcome> {
    await object.repos.opp.updateAmount(subject.opportunityId, subject.newAmount);
    return recordAndReturn(
      object,
      auditBase(object, `Opportunity ${subject.opportunityId} amount updated: ${subject.previousAmount} → ${subject.newAmount}`),
      { opportunityId: subject.opportunityId },
    );
  }
}

class ApplyClosedWon extends OpportunityApplicationTemplate<OpportunityClosedWonRequested> {
  protected async doApply(
    subject: OpportunityClosedWonRequested,
    object: Readonly<ApplicationObject>,
  ): Promise<ApplicationOutcome> {
    await object.repos.opp.closeWon(subject.opportunityId, subject.contractRef);
    await object.ports.integrations.enqueue("opportunity.closed_won", {
      opportunityId: subject.opportunityId,
      contractRef: subject.contractRef,
    });
    return recordAndReturn(
      object,
      auditBase(object, `Opportunity ${subject.opportunityId} closed Won`, {
        afterStageKey: "ClosedWon",
      }),
      { opportunityId: subject.opportunityId },
      ["integration:closed_won"],
    );
  }
}

class ApplyClosedLost extends OpportunityApplicationTemplate<OpportunityClosedLost> {
  protected async doApply(
    subject: OpportunityClosedLost,
    object: Readonly<ApplicationObject>,
  ): Promise<ApplicationOutcome> {
    await object.repos.opp.closeLost(subject.opportunityId, subject.reason);
    return recordAndReturn(
      object,
      auditBase(object, `Opportunity ${subject.opportunityId} closed Lost: ${subject.reason}`, {
        afterStageKey: "ClosedLost",
      }),
      { opportunityId: subject.opportunityId },
    );
  }
}

// ─── Abstract Template: Compliance Events ────────────────────────────────────

abstract class ComplianceApplicationTemplate<SU extends ComplianceSubjectUnion>
  implements Template<ApplyCrmEvent, [], SU>
{
  execute<T extends SU>(subject: T, object: Readonly<ApplicationObject>): Promise<ApplicationOutcome> {
    assertAllowed(object);
    return this.doApply(subject, object);
  }

  protected abstract doApply(
    subject: SU,
    object: Readonly<ApplicationObject>,
  ): Promise<ApplicationOutcome>;
}

// ─── Compliance Strategies ────────────────────────────────────────────────────

class ApplyConsentUpdate extends ComplianceApplicationTemplate<ConsentUpdated> {
  protected async doApply(
    subject: ConsentUpdated,
    object: Readonly<ApplicationObject>,
  ): Promise<ApplicationOutcome> {
    await object.repos.consent.updateConsent(subject.contactId, subject.newStatus, {
      method: subject.method,
      source: subject.source,
    });
    return recordAndReturn(
      object,
      auditBase(object, `Consent updated for contact ${subject.contactId}: → ${subject.newStatus}`),
      { contactId: subject.contactId },
    );
  }
}

class ApplyDoNotContact extends ComplianceApplicationTemplate<DoNotContactFlagged> {
  protected async doApply(
    subject: DoNotContactFlagged,
    object: Readonly<ApplicationObject>,
  ): Promise<ApplicationOutcome> {
    await object.repos.consent.flagDoNotContact(subject.contactId);
    return recordAndReturn(
      object,
      auditBase(object, `Do-not-contact flag set for contact ${subject.contactId}`),
      { contactId: subject.contactId },
    );
  }
}

class ApplyOutbound extends ComplianceApplicationTemplate<OutboundAttempted> {
  protected async doApply(
    subject: OutboundAttempted,
    object: Readonly<ApplicationObject>,
  ): Promise<ApplicationOutcome> {
    // Outbound attempt is logged for audit; actual send is handled externally.
    return recordAndReturn(
      object,
      auditBase(object, `Outbound attempted via ${subject.channel} to contact ${subject.contactId}`),
      { contactId: subject.contactId },
    );
  }
}

class ApplyComplianceOverride extends ComplianceApplicationTemplate<ComplianceOverrideRequested> {
  protected async doApply(
    subject: ComplianceOverrideRequested,
    object: Readonly<ApplicationObject>,
  ): Promise<ApplicationOutcome> {
    await object.repos.consent.recordOverride(
      subject.contactId,
      subject.requestedByUserId,
      subject.justification,
    );
    return recordAndReturn(
      object,
      auditBase(object, `Compliance override recorded for contact ${subject.contactId}: ${subject.overrideType}`),
      { contactId: subject.contactId },
    );
  }
}

// ─── Abstract Template: Quote Events ─────────────────────────────────────────

abstract class QuoteApplicationTemplate<SU extends QuoteSubjectUnion>
  implements Template<ApplyCrmEvent, [], SU>
{
  execute<T extends SU>(subject: T, object: Readonly<ApplicationObject>): Promise<ApplicationOutcome> {
    assertAllowed(object);
    return this.doApply(subject, object);
  }

  protected abstract doApply(
    subject: SU,
    object: Readonly<ApplicationObject>,
  ): Promise<ApplicationOutcome>;
}

// ─── Quote Strategies ─────────────────────────────────────────────────────────

class ApplyQuoteCreated extends QuoteApplicationTemplate<QuoteCreated> {
  protected async doApply(
    subject: QuoteCreated,
    object: Readonly<ApplicationObject>,
  ): Promise<ApplicationOutcome> {
    const quoteId = await object.repos.quote.create(subject.opportunityId);
    return recordAndReturn(
      object,
      auditBase(object, `Quote ${subject.quoteId} created for opportunity ${subject.opportunityId}`),
      { quoteId, opportunityId: subject.opportunityId },
    );
  }
}

class ApplyQuoteSubmitted extends QuoteApplicationTemplate<QuoteSubmittedForApproval> {
  protected async doApply(
    subject: QuoteSubmittedForApproval,
    object: Readonly<ApplicationObject>,
  ): Promise<ApplicationOutcome> {
    await object.repos.quote.updateApprovalStatus(subject.quoteId, "Pending");
    const policy = object.validationContext.verticalPolicy!;
    const approverRoles = [...new Set(policy.approvalRules.map((r) => r.requiredApproverRole))];
    const queued = approverRoles.map((role) => `notify:approver-role:${role}`);
    for (const role of approverRoles) {
      await object.ports.notifications.notifyRole(
        subject.organizationId,
        role,
        `Quote ${subject.quoteId} is pending your approval.`,
      );
    }
    return recordAndReturn(
      object,
      auditBase(object, `Quote ${subject.quoteId} submitted for approval`),
      { quoteId: subject.quoteId },
      queued,
    );
  }
}

class ApplyQuoteApproved extends QuoteApplicationTemplate<QuoteApproved> {
  protected async doApply(
    subject: QuoteApproved,
    object: Readonly<ApplicationObject>,
  ): Promise<ApplicationOutcome> {
    await object.repos.quote.updateApprovalStatus(subject.quoteId, "Approved");
    return recordAndReturn(
      object,
      auditBase(object, `Quote ${subject.quoteId} approved by ${subject.approvedByUserId}`),
      { quoteId: subject.quoteId },
    );
  }
}

class ApplyQuoteRejected extends QuoteApplicationTemplate<QuoteRejected> {
  protected async doApply(
    subject: QuoteRejected,
    object: Readonly<ApplicationObject>,
  ): Promise<ApplicationOutcome> {
    await object.repos.quote.updateApprovalStatus(subject.quoteId, "Rejected");
    return recordAndReturn(
      object,
      auditBase(object, `Quote ${subject.quoteId} rejected by ${subject.rejectedByUserId}: ${subject.reason}`),
      { quoteId: subject.quoteId },
    );
  }
}

// ─── Abstract Template: Handoff Events ───────────────────────────────────────

abstract class HandoffApplicationTemplate<SU extends HandoffSubjectUnion>
  implements Template<ApplyCrmEvent, [], SU>
{
  execute<T extends SU>(subject: T, object: Readonly<ApplicationObject>): Promise<ApplicationOutcome> {
    assertAllowed(object);
    return this.doApply(subject, object);
  }

  protected abstract doApply(
    subject: SU,
    object: Readonly<ApplicationObject>,
  ): Promise<ApplicationOutcome>;
}

// ─── Handoff Strategies ───────────────────────────────────────────────────────

class ApplyHandoffGenerated extends HandoffApplicationTemplate<HandoffGenerated> {
  protected async doApply(
    subject: HandoffGenerated,
    object: Readonly<ApplicationObject>,
  ): Promise<ApplicationOutcome> {
    const handoffId = await object.repos.handoff.create(subject.opportunityId);
    return recordAndReturn(
      object,
      auditBase(object, `Handoff ${subject.handoffId} generated for opportunity ${subject.opportunityId}`),
      { handoffId, opportunityId: subject.opportunityId },
    );
  }
}

class ApplyHandoffAccepted extends HandoffApplicationTemplate<HandoffAccepted> {
  protected async doApply(
    subject: HandoffAccepted,
    object: Readonly<ApplicationObject>,
  ): Promise<ApplicationOutcome> {
    await object.repos.handoff.updateStatus(subject.handoffId, "Accepted");
    await object.ports.integrations.enqueue("handoff.accepted", {
      handoffId: subject.handoffId,
      opportunityId: subject.opportunityId,
    });
    return recordAndReturn(
      object,
      auditBase(object, `Handoff ${subject.handoffId} accepted by ${subject.acceptedByUserId}`),
      { handoffId: subject.handoffId },
      ["integration:handoff_accepted"],
    );
  }
}

class ApplyHandoffRejected extends HandoffApplicationTemplate<HandoffRejected> {
  protected async doApply(
    subject: HandoffRejected,
    object: Readonly<ApplicationObject>,
  ): Promise<ApplicationOutcome> {
    await object.repos.handoff.updateStatus(subject.handoffId, "Rejected");
    return recordAndReturn(
      object,
      auditBase(object, `Handoff ${subject.handoffId} rejected by ${subject.rejectedByUserId}: ${subject.reason}`),
      { handoffId: subject.handoffId },
    );
  }
}

// ─── Abstract Template: AI Events ────────────────────────────────────────────

/**
 * AI application templates persist advisory artifacts and audit records.
 * They never mutate canonical CRM fields (stage, amount, forecast, quote terms).
 * All AI provenance (model ID, prompt template, before/after) is captured in audit.
 */
abstract class AiApplicationTemplate<SU extends AiSubjectUnion>
  implements Template<ApplyCrmEvent, [], SU>
{
  execute<T extends SU>(subject: T, object: Readonly<ApplicationObject>): Promise<ApplicationOutcome> {
    assertAllowed(object);
    return this.doApply(subject, object);
  }

  protected abstract doApply(
    subject: SU,
    object: Readonly<ApplicationObject>,
  ): Promise<ApplicationOutcome>;
}

// ─── AI Strategies ────────────────────────────────────────────────────────────

class ApplyAiDraftRequest extends AiApplicationTemplate<AiDraftRequested> {
  protected async doApply(
    subject: AiDraftRequested,
    object: Readonly<ApplicationObject>,
  ): Promise<ApplicationOutcome> {
    const body = await object.ports.llm.generate("draft:" + subject.channel, {
      organizationId: subject.organizationId,
      opportunityId: subject.opportunityId,
      contactId: subject.contactId,
      stageContext: subject.stageContext,
    });
    const draftId = await object.repos.ai.saveDraft(subject.organizationId, {
      channel: subject.channel,
      body,
      personalizationFactors: [],
      riskWarnings: [],
    });
    return recordAndReturn(
      object,
      auditBase(object, `AI draft generated: channel=${subject.channel}`),
      { draftId },
    );
  }
}

class ApplyAiNotesIngested extends AiApplicationTemplate<AiNotesIngested> {
  protected async doApply(
    subject: AiNotesIngested,
    object: Readonly<ApplicationObject>,
  ): Promise<ApplicationOutcome> {
    // Ingestion is a read operation — record it for traceability only.
    return recordAndReturn(
      object,
      auditBase(object, `AI notes ingested: meetingId=${subject.meetingId}`),
      { meetingId: subject.meetingId },
    );
  }
}

class ApplyAiProposedUpdates extends AiApplicationTemplate<AiProposedUpdatesGenerated> {
  protected async doApply(
    subject: AiProposedUpdatesGenerated,
    object: Readonly<ApplicationObject>,
  ): Promise<ApplicationOutcome> {
    const batchId = await object.repos.ai.saveProposedUpdates(
      subject.organizationId,
      subject.proposedUpdates,
    );
    return recordAndReturn(
      object,
      auditBase(object, `AI proposed updates stored: meetingId=${subject.meetingId}, count=${subject.proposedUpdates.length}`),
      { batchId },
    );
  }
}

class ApplyAiSuggestionAccepted extends AiApplicationTemplate<AiSuggestionAccepted> {
  protected async doApply(
    subject: AiSuggestionAccepted,
    object: Readonly<ApplicationObject>,
  ): Promise<ApplicationOutcome> {
    await object.repos.ai.recordSuggestionAccepted(
      subject.suggestionId,
      subject.approval.approvedBy,
    );
    // Audit record carries full AI provenance.
    return recordAndReturn(
      object,
      auditBase(object, [
        `AI suggestion accepted: ${subject.suggestionId}`,
        `model=${subject.aiModelId}`,
        `template=${subject.promptTemplateId}`,
        `approvedBy=${subject.approval.approvedBy}`,
      ].join(" | ")),
      { suggestionId: subject.suggestionId },
    );
  }
}

class ApplyAiSuggestionRejected extends AiApplicationTemplate<AiSuggestionRejected> {
  protected async doApply(
    subject: AiSuggestionRejected,
    object: Readonly<ApplicationObject>,
  ): Promise<ApplicationOutcome> {
    await object.repos.ai.recordSuggestionRejected(
      subject.suggestionId,
      subject.rejectedByUserId,
    );
    return recordAndReturn(
      object,
      auditBase(object, `AI suggestion rejected: ${subject.suggestionId}`),
      { suggestionId: subject.suggestionId },
    );
  }
}

class ApplyAiDealBrief extends AiApplicationTemplate<AiDealBriefRequested> {
  protected async doApply(
    subject: AiDealBriefRequested,
    object: Readonly<ApplicationObject>,
  ): Promise<ApplicationOutcome> {
    // Deal brief is read-only advisory. Record request for traceability.
    return recordAndReturn(
      object,
      auditBase(object, `AI deal brief requested: opportunityId=${subject.opportunityId}`),
      { opportunityId: subject.opportunityId },
    );
  }
}

class ApplyAiPipelineSummary extends AiApplicationTemplate<AiPipelineSummaryRequested> {
  protected async doApply(
    subject: AiPipelineSummaryRequested,
    object: Readonly<ApplicationObject>,
  ): Promise<ApplicationOutcome> {
    return recordAndReturn(
      object,
      auditBase(object, `AI pipeline summary requested: ${subject.periodStart} → ${subject.periodEnd}`),
      {},
    );
  }
}

class ApplyAiHygieneScan extends AiApplicationTemplate<AiHygieneScanRequested> {
  protected async doApply(
    subject: AiHygieneScanRequested,
    object: Readonly<ApplicationObject>,
  ): Promise<ApplicationOutcome> {
    return recordAndReturn(
      object,
      auditBase(object, `AI hygiene scan requested: scope=${subject.scope}`),
      {},
    );
  }
}

// ─── Singleton Strategy Instances ─────────────────────────────────────────────

const applyLeadCreated = new ApplyLeadCreated();
const applyLeadAssigned = new ApplyLeadAssigned();
const applyLeadQualified = new ApplyLeadQualified();
const applyLeadDisqualified = new ApplyLeadDisqualified();
const applyLeadConverted = new ApplyLeadConverted();

const applyOpportunityCreated = new ApplyOpportunityCreated();
const applyStageTransition = new ApplyStageTransition();
const applyAmountUpdate = new ApplyAmountUpdate();
const applyClosedWon = new ApplyClosedWon();
const applyClosedLost = new ApplyClosedLost();

const applyConsentUpdate = new ApplyConsentUpdate();
const applyDoNotContact = new ApplyDoNotContact();
const applyOutbound = new ApplyOutbound();
const applyComplianceOverride = new ApplyComplianceOverride();

const applyQuoteCreated = new ApplyQuoteCreated();
const applyQuoteSubmitted = new ApplyQuoteSubmitted();
const applyQuoteApproved = new ApplyQuoteApproved();
const applyQuoteRejected = new ApplyQuoteRejected();

const applyHandoffGenerated = new ApplyHandoffGenerated();
const applyHandoffAccepted = new ApplyHandoffAccepted();
const applyHandoffRejected = new ApplyHandoffRejected();

const applyAiDraftRequest = new ApplyAiDraftRequest();
const applyAiNotesIngested = new ApplyAiNotesIngested();
const applyAiProposedUpdates = new ApplyAiProposedUpdates();
const applyAiSuggestionAccepted = new ApplyAiSuggestionAccepted();
const applyAiSuggestionRejected = new ApplyAiSuggestionRejected();
const applyAiDealBrief = new ApplyAiDealBrief();
const applyAiPipelineSummary = new ApplyAiPipelineSummary();
const applyAiHygieneScan = new ApplyAiHygieneScan();

// ─── Command ──────────────────────────────────────────────────────────────────

export class ApplyCrmEvent extends Command<
  CrmEvent,
  ApplicationObject,
  Promise<ApplicationOutcome>,
  [
    // Lead
    LeadCreated,
    LeadAssigned,
    LeadQualified,
    LeadDisqualified,
    LeadConvertedToOpportunity,
    // Opportunity
    OpportunityCreated,
    StageTransitionRequested,
    OpportunityAmountUpdated,
    OpportunityClosedWonRequested,
    OpportunityClosedLost,
    // Compliance
    ConsentUpdated,
    DoNotContactFlagged,
    OutboundAttempted,
    ComplianceOverrideRequested,
    // Quote
    QuoteCreated,
    QuoteSubmittedForApproval,
    QuoteApproved,
    QuoteRejected,
    // Handoff
    HandoffGenerated,
    HandoffAccepted,
    HandoffRejected,
    // AI
    AiDraftRequested,
    AiNotesIngested,
    AiProposedUpdatesGenerated,
    AiSuggestionAccepted,
    AiSuggestionRejected,
    AiDealBriefRequested,
    AiPipelineSummaryRequested,
    AiHygieneScanRequested,
  ]
> {
  readonly commandName = "applyCrmEvent" as const;

  // ── Lead ──────────────────────────────────────────────────────────
  resolveLeadCreated(s: LeadCreated, o: Readonly<ApplicationObject>) { return applyLeadCreated; }
  resolveLeadAssigned(s: LeadAssigned, o: Readonly<ApplicationObject>) { return applyLeadAssigned; }
  resolveLeadQualified(s: LeadQualified, o: Readonly<ApplicationObject>) { return applyLeadQualified; }
  resolveLeadDisqualified(s: LeadDisqualified, o: Readonly<ApplicationObject>) { return applyLeadDisqualified; }
  resolveLeadConvertedToOpportunity(s: LeadConvertedToOpportunity, o: Readonly<ApplicationObject>) { return applyLeadConverted; }

  // ── Opportunity ───────────────────────────────────────────────────
  resolveOpportunityCreated(s: OpportunityCreated, o: Readonly<ApplicationObject>) { return applyOpportunityCreated; }
  resolveStageTransitionRequested(s: StageTransitionRequested, o: Readonly<ApplicationObject>) { return applyStageTransition; }
  resolveOpportunityAmountUpdated(s: OpportunityAmountUpdated, o: Readonly<ApplicationObject>) { return applyAmountUpdate; }
  resolveOpportunityClosedWonRequested(s: OpportunityClosedWonRequested, o: Readonly<ApplicationObject>) { return applyClosedWon; }
  resolveOpportunityClosedLost(s: OpportunityClosedLost, o: Readonly<ApplicationObject>) { return applyClosedLost; }

  // ── Compliance ────────────────────────────────────────────────────
  resolveConsentUpdated(s: ConsentUpdated, o: Readonly<ApplicationObject>) { return applyConsentUpdate; }
  resolveDoNotContactFlagged(s: DoNotContactFlagged, o: Readonly<ApplicationObject>) { return applyDoNotContact; }
  resolveOutboundAttempted(s: OutboundAttempted, o: Readonly<ApplicationObject>) { return applyOutbound; }
  resolveComplianceOverrideRequested(s: ComplianceOverrideRequested, o: Readonly<ApplicationObject>) { return applyComplianceOverride; }

  // ── Quote ─────────────────────────────────────────────────────────
  resolveQuoteCreated(s: QuoteCreated, o: Readonly<ApplicationObject>) { return applyQuoteCreated; }
  resolveQuoteSubmittedForApproval(s: QuoteSubmittedForApproval, o: Readonly<ApplicationObject>) { return applyQuoteSubmitted; }
  resolveQuoteApproved(s: QuoteApproved, o: Readonly<ApplicationObject>) { return applyQuoteApproved; }
  resolveQuoteRejected(s: QuoteRejected, o: Readonly<ApplicationObject>) { return applyQuoteRejected; }

  // ── Handoff ───────────────────────────────────────────────────────
  resolveHandoffGenerated(s: HandoffGenerated, o: Readonly<ApplicationObject>) { return applyHandoffGenerated; }
  resolveHandoffAccepted(s: HandoffAccepted, o: Readonly<ApplicationObject>) { return applyHandoffAccepted; }
  resolveHandoffRejected(s: HandoffRejected, o: Readonly<ApplicationObject>) { return applyHandoffRejected; }

  // ── AI ────────────────────────────────────────────────────────────
  resolveAiDraftRequested(s: AiDraftRequested, o: Readonly<ApplicationObject>) { return applyAiDraftRequest; }
  resolveAiNotesIngested(s: AiNotesIngested, o: Readonly<ApplicationObject>) { return applyAiNotesIngested; }
  resolveAiProposedUpdatesGenerated(s: AiProposedUpdatesGenerated, o: Readonly<ApplicationObject>) { return applyAiProposedUpdates; }
  resolveAiSuggestionAccepted(s: AiSuggestionAccepted, o: Readonly<ApplicationObject>) { return applyAiSuggestionAccepted; }
  resolveAiSuggestionRejected(s: AiSuggestionRejected, o: Readonly<ApplicationObject>) { return applyAiSuggestionRejected; }
  resolveAiDealBriefRequested(s: AiDealBriefRequested, o: Readonly<ApplicationObject>) { return applyAiDealBrief; }
  resolveAiPipelineSummaryRequested(s: AiPipelineSummaryRequested, o: Readonly<ApplicationObject>) { return applyAiPipelineSummary; }
  resolveAiHygieneScanRequested(s: AiHygieneScanRequested, o: Readonly<ApplicationObject>) { return applyAiHygieneScan; }
}
