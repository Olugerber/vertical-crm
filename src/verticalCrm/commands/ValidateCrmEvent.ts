/**
 * verticalCrm — ValidateCrmEvent Command
 *
 * Deterministically validates any CRM event against the organization's
 * selected VerticalPolicy. Dispatches every Subject to its own validator
 * strategy via the codascon double-dispatch protocol.
 *
 * Design invariants:
 *   - Fail-closed: null verticalPolicy → POLICY_NOT_CONFIGURED blocks all.
 *   - No silent defaults: every block reason is explicit and code-bearing.
 *   - Read-only: this Command inspects state; it never mutates anything.
 *   - Vertical behaviour is driven by VerticalPolicy config, never by
 *     switch/case on vertical identifiers.
 *
 * @module verticalCrm/commands/ValidateCrmEvent
 */

import { Command } from "codascon";
import type { Template, CommandSubjectUnion } from "codascon";
import type {
  CrmEvent,
  ValidationObject,
  ValidationOutcome,
  VerticalPolicy,
  BlockedReason,
  RequiredApproval,
  RequiredEvidence,
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

// ─── Outcome Helpers ──────────────────────────────────────────────────────────

function policyBlocked(): ValidationOutcome {
  return {
    allowed: false,
    blockedReasons: [
      {
        code: "POLICY_NOT_CONFIGURED",
        message:
          "No vertical policy is configured for this organization. All actions are blocked.",
      },
    ],
    missingFields: [],
    requiredApprovals: [],
    requiredEvidence: [],
  };
}

function pass(): ValidationOutcome {
  return {
    allowed: true,
    blockedReasons: [],
    missingFields: [],
    requiredApprovals: [],
    requiredEvidence: [],
  };
}

function block(
  reasons: readonly BlockedReason[],
  missingFields: readonly string[] = [],
  requiredApprovals: readonly RequiredApproval[] = [],
  requiredEvidence: readonly RequiredEvidence[] = [],
): ValidationOutcome {
  return { allowed: false, blockedReasons: reasons, missingFields, requiredApprovals, requiredEvidence };
}

// ─── Abstract Template: Lead Events ──────────────────────────────────────────

abstract class LeadValidationTemplate<SU extends LeadSubjectUnion>
  implements Template<ValidateCrmEvent, [], SU>
{
  execute<T extends SU>(subject: T, object: Readonly<ValidationObject>): ValidationOutcome {
    if (!object.verticalPolicy) return policyBlocked();
    return this.doValidate(subject, object, object.verticalPolicy);
  }

  protected abstract doValidate(
    subject: SU,
    object: Readonly<ValidationObject>,
    policy: VerticalPolicy,
  ): ValidationOutcome;
}

// ─── Lead Strategies ─────────────────────────────────────────────────────────

class ValidateLeadCreated extends LeadValidationTemplate<LeadCreated> {
  protected doValidate(
    subject: LeadCreated,
    object: Readonly<ValidationObject>,
    policy: VerticalPolicy,
  ): ValidationOutcome {
    // Validate required fields and source legitimacy.
    if (!subject.source) {
      return block([{ code: "LEAD_SOURCE_REQUIRED", message: "Lead source must be specified." }]);
    }
    return pass();
  }
}

class ValidateLeadAssigned extends LeadValidationTemplate<LeadAssigned> {
  protected doValidate(
    subject: LeadAssigned,
    object: Readonly<ValidationObject>,
    policy: VerticalPolicy,
  ): ValidationOutcome {
    if (!subject.toUserId) {
      return block([{ code: "ASSIGNEE_REQUIRED", message: "Target assignee user ID is required." }]);
    }
    return pass();
  }
}

class ValidateLeadQualified extends LeadValidationTemplate<LeadQualified> {
  protected doValidate(
    subject: LeadQualified,
    object: Readonly<ValidationObject>,
    policy: VerticalPolicy,
  ): ValidationOutcome {
    const { requiredKeys } = policy.qualificationFramework;
    const completed = new Set(subject.qualificationChecklist.completedKeys);
    const missing = requiredKeys.filter((k) => !completed.has(k));
    if (missing.length > 0) {
      return block(
        [{ code: "QUALIFICATION_INCOMPLETE", message: "Qualification checklist is incomplete." }],
        missing,
      );
    }
    return pass();
  }
}

class ValidateLeadDisqualified extends LeadValidationTemplate<LeadDisqualified> {
  protected doValidate(
    subject: LeadDisqualified,
    object: Readonly<ValidationObject>,
    policy: VerticalPolicy,
  ): ValidationOutcome {
    if (!subject.reason) {
      return block([{ code: "DISQUALIFICATION_REASON_REQUIRED", message: "A reason must be provided when disqualifying a lead." }]);
    }
    return pass();
  }
}

class ValidateLeadConverted extends LeadValidationTemplate<LeadConvertedToOpportunity> {
  protected doValidate(
    subject: LeadConvertedToOpportunity,
    object: Readonly<ValidationObject>,
    policy: VerticalPolicy,
  ): ValidationOutcome {
    const { requiredKeys } = policy.qualificationFramework;
    const completed = new Set(subject.qualificationChecklist.completedKeys);
    const missing = requiredKeys.filter((k) => !completed.has(k));
    if (missing.length > 0) {
      return block(
        [{ code: "CONVERSION_QUALIFICATION_INCOMPLETE", message: "Qualification must be complete before converting a lead to an opportunity." }],
        missing,
      );
    }
    return pass();
  }
}

// ─── Abstract Template: Opportunity Events ────────────────────────────────────

abstract class OpportunityValidationTemplate<SU extends OppSubjectUnion>
  implements Template<ValidateCrmEvent, [], SU>
{
  execute<T extends SU>(subject: T, object: Readonly<ValidationObject>): ValidationOutcome {
    if (!object.verticalPolicy) return policyBlocked();
    return this.doValidate(subject, object, object.verticalPolicy);
  }

  protected abstract doValidate(
    subject: SU,
    object: Readonly<ValidationObject>,
    policy: VerticalPolicy,
  ): ValidationOutcome;
}

// ─── Opportunity Strategies ───────────────────────────────────────────────────

class ValidateOpportunityCreated extends OpportunityValidationTemplate<OpportunityCreated> {
  protected doValidate(
    subject: OpportunityCreated,
    object: Readonly<ValidationObject>,
    policy: VerticalPolicy,
  ): ValidationOutcome {
    if (!object.snapshots.account) {
      return block([{ code: "ACCOUNT_REQUIRED", message: "An account snapshot must exist before creating an opportunity." }]);
    }
    if (subject.amount <= 0) {
      return block([{ code: "AMOUNT_MUST_BE_POSITIVE", message: "Opportunity amount must be explicitly provided and greater than zero." }]);
    }
    const { riskFlags } = object.snapshots.account;
    if (riskFlags.includes("LegalHold") || riskFlags.includes("ComplianceHold")) {
      return block([{ code: "ACCOUNT_ON_HOLD", message: "Account has an active legal or compliance hold. New opportunities cannot be created." }]);
    }
    return pass();
  }
}

class ValidateStageTransition extends OpportunityValidationTemplate<StageTransitionRequested> {
  protected doValidate(
    subject: StageTransitionRequested,
    object: Readonly<ValidationObject>,
    policy: VerticalPolicy,
  ): ValidationOutcome {
    const transitionKey = `${subject.fromStageKey}->${subject.toStageKey}`;

    // Check transition is permitted by policy.
    const allowed = policy.transitions.some(
      (t) => t.fromStageKey === subject.fromStageKey && t.toStageKey === subject.toStageKey,
    );
    if (!allowed) {
      return block([{
        code: "TRANSITION_NOT_PERMITTED",
        message: `Stage transition from "${subject.fromStageKey}" to "${subject.toStageKey}" is not permitted by the active vertical policy.`,
      }]);
    }

    // Check required fields for this transition.
    const required = policy.requiredFieldsByTransition[transitionKey] ?? [];
    const missing = required.filter((f) => !subject.providedFields[f]);
    if (missing.length > 0) {
      return block(
        [{ code: "MISSING_TRANSITION_FIELDS", message: `Required fields are missing for this stage transition.` }],
        missing,
      );
    }

    return pass();
  }
}

class ValidateAmountUpdate extends OpportunityValidationTemplate<OpportunityAmountUpdated> {
  protected doValidate(
    subject: OpportunityAmountUpdated,
    object: Readonly<ValidationObject>,
    policy: VerticalPolicy,
  ): ValidationOutcome {
    if (subject.newAmount <= 0) {
      return block([{ code: "AMOUNT_MUST_BE_POSITIVE", message: "Updated amount must be greater than zero. Amounts are never invented or defaulted." }]);
    }
    return pass();
  }
}

class ValidateClosedWonRequest extends OpportunityValidationTemplate<OpportunityClosedWonRequested> {
  protected doValidate(
    subject: OpportunityClosedWonRequested,
    object: Readonly<ValidationObject>,
    policy: VerticalPolicy,
  ): ValidationOutcome {
    const blockedReasons: BlockedReason[] = [];
    const missing: string[] = [];
    const requiredApprovals: RequiredApproval[] = [];
    const requiredEvidence: RequiredEvidence[] = [];

    // Check policy-required fields for closed-won.
    for (const field of policy.closedWonRequiredFields) {
      const snapshot = object.snapshots.opportunity;
      const hasField =
        field === "contractRef" ? !!subject.contractRef :
        field === "purchaseOrderRef" ? !!subject.purchaseOrderRef :
        snapshot ? !!(snapshot as unknown as Record<string, unknown>)[field] : false;
      if (!hasField) missing.push(field);
    }

    // Quote must be in approved state.
    const quote = object.snapshots.quote;
    if (!quote || quote.approvalStatus !== "Approved") {
      blockedReasons.push({
        code: "QUOTE_NOT_APPROVED",
        message: "An approved quote is required to close an opportunity as Won.",
      });
    }

    // Handoff must be generated and ready.
    const handoff = object.snapshots.handoff;
    if (!handoff || (handoff.status !== "Ready" && handoff.status !== "Accepted")) {
      blockedReasons.push({
        code: "HANDOFF_NOT_READY",
        message: "A handoff package in Ready or Accepted status is required to close Won.",
      });
    }

    if (blockedReasons.length > 0 || missing.length > 0) {
      return block(blockedReasons, missing, requiredApprovals, requiredEvidence);
    }
    return pass();
  }
}

class ValidateClosedLost extends OpportunityValidationTemplate<OpportunityClosedLost> {
  protected doValidate(
    subject: OpportunityClosedLost,
    object: Readonly<ValidationObject>,
    policy: VerticalPolicy,
  ): ValidationOutcome {
    if (!subject.reason) {
      return block([{ code: "LOSS_REASON_REQUIRED", message: "A reason is required when closing an opportunity as Lost." }]);
    }
    return pass();
  }
}

// ─── Abstract Template: Compliance Events ────────────────────────────────────

abstract class ComplianceValidationTemplate<SU extends ComplianceSubjectUnion>
  implements Template<ValidateCrmEvent, [], SU>
{
  execute<T extends SU>(subject: T, object: Readonly<ValidationObject>): ValidationOutcome {
    if (!object.verticalPolicy) return policyBlocked();
    return this.doValidate(subject, object, object.verticalPolicy);
  }

  protected abstract doValidate(
    subject: SU,
    object: Readonly<ValidationObject>,
    policy: VerticalPolicy,
  ): ValidationOutcome;
}

// ─── Compliance Strategies ────────────────────────────────────────────────────

class ValidateConsentUpdate extends ComplianceValidationTemplate<ConsentUpdated> {
  protected doValidate(
    subject: ConsentUpdated,
    object: Readonly<ValidationObject>,
    policy: VerticalPolicy,
  ): ValidationOutcome {
    if (!subject.method || !subject.source) {
      return block(
        [{ code: "CONSENT_EVIDENCE_REQUIRED", message: "Consent method and source are required to update consent status." }],
        ["method", "source"].filter((f) => !subject[f as keyof typeof subject]),
      );
    }
    return pass();
  }
}

class ValidateDoNotContact extends ComplianceValidationTemplate<DoNotContactFlagged> {
  protected doValidate(
    subject: DoNotContactFlagged,
    object: Readonly<ValidationObject>,
    policy: VerticalPolicy,
  ): ValidationOutcome {
    // DNC flag is always permitted — it is a protective action.
    return pass();
  }
}

class ValidateOutbound extends ComplianceValidationTemplate<OutboundAttempted> {
  protected doValidate(
    subject: OutboundAttempted,
    object: Readonly<ValidationObject>,
    policy: VerticalPolicy,
  ): ValidationOutcome {
    const contact = object.snapshots.contact;

    // Hard block: do-not-contact flag.
    if (contact?.doNotContact) {
      return block([{
        code: "DNC_CONTACT_BLOCKED",
        message: "Contact has do-not-contact flag set. Outbound is blocked. A compliance override workflow must be completed first.",
      }]);
    }

    // Hard block: opt-out consent.
    if (contact?.consentStatus === "OptOut") {
      return block([{
        code: "CONSENT_OPT_OUT_BLOCKED",
        message: "Contact has opted out. Outbound is blocked unless a valid compliance override is approved.",
      }]);
    }

    // Check channel is permitted by policy.
    if (!policy.complianceRules.allowedOutboundChannels.includes(subject.channel)) {
      return block([{
        code: "CHANNEL_NOT_PERMITTED",
        message: `Channel "${subject.channel}" is not permitted by the active vertical policy's compliance rules.`,
      }]);
    }

    // Check consent is required for this channel.
    const consentRequired = policy.complianceRules.consentRequiredChannels.includes(subject.channel);
    if (consentRequired && contact?.consentStatus !== "OptIn") {
      return block([{
        code: "CONSENT_REQUIRED_FOR_CHANNEL",
        message: `Channel "${subject.channel}" requires explicit OptIn consent. Current status: ${contact?.consentStatus ?? "Unknown"}.`,
      }]);
    }

    return pass();
  }
}

class ValidateComplianceOverride extends ComplianceValidationTemplate<ComplianceOverrideRequested> {
  protected doValidate(
    subject: ComplianceOverrideRequested,
    object: Readonly<ValidationObject>,
    policy: VerticalPolicy,
  ): ValidationOutcome {
    if (!policy.complianceRules.dncOverrideAllowed) {
      return block([{
        code: "OVERRIDE_NOT_PERMITTED",
        message: "The active vertical policy does not permit compliance overrides. Contact your compliance administrator.",
      }]);
    }

    const requiredRole = policy.complianceRules.dncOverrideRequiredRole;
    if (requiredRole && !object.actor.roles.includes(requiredRole)) {
      return block(
        [{ code: "OVERRIDE_INSUFFICIENT_ROLE", message: `Compliance override requires role: ${requiredRole}.` }],
        [],
        [{ type: "ComplianceOverride", ownerRole: requiredRole }],
      );
    }

    if (!subject.justification) {
      return block(
        [{ code: "OVERRIDE_JUSTIFICATION_REQUIRED", message: "A written justification is required to request a compliance override." }],
        ["justification"],
      );
    }

    return pass();
  }
}

// ─── Abstract Template: Quote Events ─────────────────────────────────────────

abstract class QuoteValidationTemplate<SU extends QuoteSubjectUnion>
  implements Template<ValidateCrmEvent, [], SU>
{
  execute<T extends SU>(subject: T, object: Readonly<ValidationObject>): ValidationOutcome {
    if (!object.verticalPolicy) return policyBlocked();
    return this.doValidate(subject, object, object.verticalPolicy);
  }

  protected abstract doValidate(
    subject: SU,
    object: Readonly<ValidationObject>,
    policy: VerticalPolicy,
  ): ValidationOutcome;
}

// ─── Quote Strategies ─────────────────────────────────────────────────────────

class ValidateQuoteCreated extends QuoteValidationTemplate<QuoteCreated> {
  protected doValidate(
    subject: QuoteCreated,
    object: Readonly<ValidationObject>,
    policy: VerticalPolicy,
  ): ValidationOutcome {
    if (!object.snapshots.opportunity) {
      return block([{ code: "OPPORTUNITY_REQUIRED", message: "A quote must be associated with an existing opportunity." }]);
    }
    return pass();
  }
}

class ValidateQuoteSubmitted extends QuoteValidationTemplate<QuoteSubmittedForApproval> {
  protected doValidate(
    subject: QuoteSubmittedForApproval,
    object: Readonly<ValidationObject>,
    policy: VerticalPolicy,
  ): ValidationOutcome {
    const quote = object.snapshots.quote;
    if (!quote) {
      return block([{ code: "QUOTE_NOT_FOUND", message: "Quote snapshot not found." }]);
    }
    if (quote.lineItems.length === 0) {
      return block([{ code: "QUOTE_EMPTY", message: "A quote must have at least one line item before submission." }]);
    }

    // Check approval rules by discount threshold.
    const requiredApprovals: RequiredApproval[] = [];
    const account = object.snapshots.account;
    for (const rule of policy.approvalRules) {
      const segmentMatch = !rule.segment || rule.segment === account?.segment;
      if (segmentMatch && quote.discountPercent >= rule.discountThresholdPercent) {
        requiredApprovals.push({ type: "DiscountApproval", ownerRole: rule.requiredApproverRole });
      }
      if (rule.nonStandardTermsTrigger && quote.nonStandardTerms.length > 0) {
        requiredApprovals.push({ type: "NonStandardTermsApproval", ownerRole: rule.requiredApproverRole });
      }
      if (rule.marginFloorPercent !== undefined && quote.marginPercent !== undefined && quote.marginPercent < rule.marginFloorPercent) {
        requiredApprovals.push({ type: "MarginException", ownerRole: rule.requiredApproverRole });
      }
    }

    if (requiredApprovals.length > 0) {
      return { allowed: false, blockedReasons: [{ code: "APPROVAL_REQUIRED", message: "Quote requires approval before submission." }], missingFields: [], requiredApprovals, requiredEvidence: [] };
    }
    return pass();
  }
}

class ValidateQuoteApproved extends QuoteValidationTemplate<QuoteApproved> {
  protected doValidate(
    subject: QuoteApproved,
    object: Readonly<ValidationObject>,
    policy: VerticalPolicy,
  ): ValidationOutcome {
    // Approver must hold at least one approval role per policy.
    const approverRoles = policy.approvalRules.map((r) => r.requiredApproverRole);
    const actorCanApprove = object.actor.roles.some((r) => approverRoles.includes(r));
    if (!actorCanApprove) {
      return block([{
        code: "INSUFFICIENT_APPROVAL_ROLE",
        message: "Actor does not hold an approver role defined by the active vertical policy.",
      }]);
    }
    return pass();
  }
}

class ValidateQuoteRejected extends QuoteValidationTemplate<QuoteRejected> {
  protected doValidate(
    subject: QuoteRejected,
    object: Readonly<ValidationObject>,
    policy: VerticalPolicy,
  ): ValidationOutcome {
    if (!subject.reason) {
      return block([{ code: "REJECTION_REASON_REQUIRED", message: "A reason is required when rejecting a quote." }]);
    }
    return pass();
  }
}

// ─── Abstract Template: Handoff Events ───────────────────────────────────────

abstract class HandoffValidationTemplate<SU extends HandoffSubjectUnion>
  implements Template<ValidateCrmEvent, [], SU>
{
  execute<T extends SU>(subject: T, object: Readonly<ValidationObject>): ValidationOutcome {
    if (!object.verticalPolicy) return policyBlocked();
    return this.doValidate(subject, object, object.verticalPolicy);
  }

  protected abstract doValidate(
    subject: SU,
    object: Readonly<ValidationObject>,
    policy: VerticalPolicy,
  ): ValidationOutcome;
}

// ─── Handoff Strategies ───────────────────────────────────────────────────────

class ValidateHandoffGenerated extends HandoffValidationTemplate<HandoffGenerated> {
  protected doValidate(
    subject: HandoffGenerated,
    object: Readonly<ValidationObject>,
    policy: VerticalPolicy,
  ): ValidationOutcome {
    const opp = object.snapshots.opportunity;
    if (!opp) {
      return block([{ code: "OPPORTUNITY_REQUIRED", message: "Handoff requires an associated opportunity snapshot." }]);
    }
    return pass();
  }
}

class ValidateHandoffAccepted extends HandoffValidationTemplate<HandoffAccepted> {
  protected doValidate(
    subject: HandoffAccepted,
    object: Readonly<ValidationObject>,
    policy: VerticalPolicy,
  ): ValidationOutcome {
    const handoff = object.snapshots.handoff;
    if (!handoff) {
      return block([{ code: "HANDOFF_NOT_FOUND", message: "Handoff snapshot not found." }]);
    }

    const requiredFields = policy.handoffPlaybooks[0]?.requiredFields ?? [];
    const completed = new Set(handoff.completedChecklistItems);
    const missing = requiredFields.filter((f) => !completed.has(f));
    if (missing.length > 0) {
      return block(
        [{ code: "HANDOFF_INCOMPLETE", message: "Handoff acceptance requires all required checklist items to be completed." }],
        missing,
      );
    }
    return pass();
  }
}

class ValidateHandoffRejected extends HandoffValidationTemplate<HandoffRejected> {
  protected doValidate(
    subject: HandoffRejected,
    object: Readonly<ValidationObject>,
    policy: VerticalPolicy,
  ): ValidationOutcome {
    if (!subject.reason) {
      return block([{ code: "REJECTION_REASON_REQUIRED", message: "A reason is required when rejecting a handoff." }]);
    }
    return pass();
  }
}

// ─── Abstract Template: AI Events ────────────────────────────────────────────

/**
 * AI events are advisory. Validation ensures policy-compliance of AI actions
 * (e.g. drafting is allowed but sending is blocked if consent is missing)
 * but never blocks read-only/generative AI requests.
 */
abstract class AiValidationTemplate<SU extends AiSubjectUnion>
  implements Template<ValidateCrmEvent, [], SU>
{
  execute<T extends SU>(subject: T, object: Readonly<ValidationObject>): ValidationOutcome {
    if (!object.verticalPolicy) return policyBlocked();
    return this.doValidate(subject, object, object.verticalPolicy);
  }

  protected abstract doValidate(
    subject: SU,
    object: Readonly<ValidationObject>,
    policy: VerticalPolicy,
  ): ValidationOutcome;
}

// ─── AI Strategies ────────────────────────────────────────────────────────────

class ValidateAiDraftRequest extends AiValidationTemplate<AiDraftRequested> {
  protected doValidate(
    subject: AiDraftRequested,
    object: Readonly<ValidationObject>,
    policy: VerticalPolicy,
  ): ValidationOutcome {
    // Drafting is always allowed. Sending is gated by outbound compliance —
    // the UI must surface riskWarnings from the draft artifact.
    return pass();
  }
}

class ValidateAiNotesIngested extends AiValidationTemplate<AiNotesIngested> {
  protected doValidate(
    subject: AiNotesIngested,
    object: Readonly<ValidationObject>,
    policy: VerticalPolicy,
  ): ValidationOutcome {
    // Notes ingestion is read-only. Always permitted.
    return pass();
  }
}

class ValidateAiProposedUpdates extends AiValidationTemplate<AiProposedUpdatesGenerated> {
  protected doValidate(
    subject: AiProposedUpdatesGenerated,
    object: Readonly<ValidationObject>,
    policy: VerticalPolicy,
  ): ValidationOutcome {
    // Generating proposed updates is non-canonical. Always permitted.
    // Each individual update will be separately validated when accepted.
    return pass();
  }
}

class ValidateAiSuggestionAccepted extends AiValidationTemplate<AiSuggestionAccepted> {
  protected doValidate(
    subject: AiSuggestionAccepted,
    object: Readonly<ValidationObject>,
    policy: VerticalPolicy,
  ): ValidationOutcome {
    // Acceptance requires explicit approval metadata.
    if (!subject.approval.approvedBy || !subject.approval.approvedAt) {
      return block(
        [{ code: "SUGGESTION_APPROVAL_MISSING", message: "Accepting an AI suggestion requires explicit approvedBy and approvedAt metadata." }],
        ["approval.approvedBy", "approval.approvedAt"],
      );
    }
    return pass();
  }
}

class ValidateAiSuggestionRejected extends AiValidationTemplate<AiSuggestionRejected> {
  protected doValidate(
    subject: AiSuggestionRejected,
    object: Readonly<ValidationObject>,
    policy: VerticalPolicy,
  ): ValidationOutcome {
    // Rejection is always permitted.
    return pass();
  }
}

class ValidateAiDealBrief extends AiValidationTemplate<AiDealBriefRequested> {
  protected doValidate(
    subject: AiDealBriefRequested,
    object: Readonly<ValidationObject>,
    policy: VerticalPolicy,
  ): ValidationOutcome {
    // Deal briefs are read-only advisory outputs. Always permitted.
    return pass();
  }
}

class ValidateAiPipelineSummary extends AiValidationTemplate<AiPipelineSummaryRequested> {
  protected doValidate(
    subject: AiPipelineSummaryRequested,
    object: Readonly<ValidationObject>,
    policy: VerticalPolicy,
  ): ValidationOutcome {
    // Pipeline summaries are derived from audit log only. Always permitted.
    return pass();
  }
}

class ValidateAiHygieneScan extends AiValidationTemplate<AiHygieneScanRequested> {
  protected doValidate(
    subject: AiHygieneScanRequested,
    object: Readonly<ValidationObject>,
    policy: VerticalPolicy,
  ): ValidationOutcome {
    // Hygiene scans are suggestion-only. Always permitted.
    return pass();
  }
}

// ─── Singleton Strategy Instances ─────────────────────────────────────────────

const validateLeadCreated = new ValidateLeadCreated();
const validateLeadAssigned = new ValidateLeadAssigned();
const validateLeadQualified = new ValidateLeadQualified();
const validateLeadDisqualified = new ValidateLeadDisqualified();
const validateLeadConverted = new ValidateLeadConverted();

const validateOpportunityCreated = new ValidateOpportunityCreated();
const validateStageTransition = new ValidateStageTransition();
const validateAmountUpdate = new ValidateAmountUpdate();
const validateClosedWonRequest = new ValidateClosedWonRequest();
const validateClosedLost = new ValidateClosedLost();

const validateConsentUpdate = new ValidateConsentUpdate();
const validateDoNotContact = new ValidateDoNotContact();
const validateOutbound = new ValidateOutbound();
const validateComplianceOverride = new ValidateComplianceOverride();

const validateQuoteCreated = new ValidateQuoteCreated();
const validateQuoteSubmitted = new ValidateQuoteSubmitted();
const validateQuoteApproved = new ValidateQuoteApproved();
const validateQuoteRejected = new ValidateQuoteRejected();

const validateHandoffGenerated = new ValidateHandoffGenerated();
const validateHandoffAccepted = new ValidateHandoffAccepted();
const validateHandoffRejected = new ValidateHandoffRejected();

const validateAiDraftRequest = new ValidateAiDraftRequest();
const validateAiNotesIngested = new ValidateAiNotesIngested();
const validateAiProposedUpdates = new ValidateAiProposedUpdates();
const validateAiSuggestionAccepted = new ValidateAiSuggestionAccepted();
const validateAiSuggestionRejected = new ValidateAiSuggestionRejected();
const validateAiDealBrief = new ValidateAiDealBrief();
const validateAiPipelineSummary = new ValidateAiPipelineSummary();
const validateAiHygieneScan = new ValidateAiHygieneScan();

// ─── Command ──────────────────────────────────────────────────────────────────

export class ValidateCrmEvent extends Command<
  CrmEvent,
  ValidationObject,
  ValidationOutcome,
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
  readonly commandName = "validateCrmEvent" as const;

  // ── Lead ──────────────────────────────────────────────────────────
  resolveLeadCreated(s: LeadCreated, o: Readonly<ValidationObject>) { return validateLeadCreated; }
  resolveLeadAssigned(s: LeadAssigned, o: Readonly<ValidationObject>) { return validateLeadAssigned; }
  resolveLeadQualified(s: LeadQualified, o: Readonly<ValidationObject>) { return validateLeadQualified; }
  resolveLeadDisqualified(s: LeadDisqualified, o: Readonly<ValidationObject>) { return validateLeadDisqualified; }
  resolveLeadConvertedToOpportunity(s: LeadConvertedToOpportunity, o: Readonly<ValidationObject>) { return validateLeadConverted; }

  // ── Opportunity ───────────────────────────────────────────────────
  resolveOpportunityCreated(s: OpportunityCreated, o: Readonly<ValidationObject>) { return validateOpportunityCreated; }
  resolveStageTransitionRequested(s: StageTransitionRequested, o: Readonly<ValidationObject>) { return validateStageTransition; }
  resolveOpportunityAmountUpdated(s: OpportunityAmountUpdated, o: Readonly<ValidationObject>) { return validateAmountUpdate; }
  resolveOpportunityClosedWonRequested(s: OpportunityClosedWonRequested, o: Readonly<ValidationObject>) { return validateClosedWonRequest; }
  resolveOpportunityClosedLost(s: OpportunityClosedLost, o: Readonly<ValidationObject>) { return validateClosedLost; }

  // ── Compliance ────────────────────────────────────────────────────
  resolveConsentUpdated(s: ConsentUpdated, o: Readonly<ValidationObject>) { return validateConsentUpdate; }
  resolveDoNotContactFlagged(s: DoNotContactFlagged, o: Readonly<ValidationObject>) { return validateDoNotContact; }
  resolveOutboundAttempted(s: OutboundAttempted, o: Readonly<ValidationObject>) { return validateOutbound; }
  resolveComplianceOverrideRequested(s: ComplianceOverrideRequested, o: Readonly<ValidationObject>) { return validateComplianceOverride; }

  // ── Quote ─────────────────────────────────────────────────────────
  resolveQuoteCreated(s: QuoteCreated, o: Readonly<ValidationObject>) { return validateQuoteCreated; }
  resolveQuoteSubmittedForApproval(s: QuoteSubmittedForApproval, o: Readonly<ValidationObject>) { return validateQuoteSubmitted; }
  resolveQuoteApproved(s: QuoteApproved, o: Readonly<ValidationObject>) { return validateQuoteApproved; }
  resolveQuoteRejected(s: QuoteRejected, o: Readonly<ValidationObject>) { return validateQuoteRejected; }

  // ── Handoff ───────────────────────────────────────────────────────
  resolveHandoffGenerated(s: HandoffGenerated, o: Readonly<ValidationObject>) { return validateHandoffGenerated; }
  resolveHandoffAccepted(s: HandoffAccepted, o: Readonly<ValidationObject>) { return validateHandoffAccepted; }
  resolveHandoffRejected(s: HandoffRejected, o: Readonly<ValidationObject>) { return validateHandoffRejected; }

  // ── AI ────────────────────────────────────────────────────────────
  resolveAiDraftRequested(s: AiDraftRequested, o: Readonly<ValidationObject>) { return validateAiDraftRequest; }
  resolveAiNotesIngested(s: AiNotesIngested, o: Readonly<ValidationObject>) { return validateAiNotesIngested; }
  resolveAiProposedUpdatesGenerated(s: AiProposedUpdatesGenerated, o: Readonly<ValidationObject>) { return validateAiProposedUpdates; }
  resolveAiSuggestionAccepted(s: AiSuggestionAccepted, o: Readonly<ValidationObject>) { return validateAiSuggestionAccepted; }
  resolveAiSuggestionRejected(s: AiSuggestionRejected, o: Readonly<ValidationObject>) { return validateAiSuggestionRejected; }
  resolveAiDealBriefRequested(s: AiDealBriefRequested, o: Readonly<ValidationObject>) { return validateAiDealBrief; }
  resolveAiPipelineSummaryRequested(s: AiPipelineSummaryRequested, o: Readonly<ValidationObject>) { return validateAiPipelineSummary; }
  resolveAiHygieneScanRequested(s: AiHygieneScanRequested, o: Readonly<ValidationObject>) { return validateAiHygieneScan; }
}
