/**
 * verticalCrm — Core CRM Event Subjects
 *
 * Subject classes for the core CRM pipeline: Lead, Opportunity, Compliance,
 * Quote, and Handoff event groups. Each declares a unique `visitName` literal
 * so the codascon double-dispatch router can route to the correct visit method.
 *
 * All subjects implement CrmEvent (carrying eventId, organizationId, occurredAt)
 * which serves as the base type B for both ValidateCrmEvent and ApplyCrmEvent.
 *
 * @module verticalCrm/CrmSubjects
 */

import { Subject } from "codascon";
import type {
  CrmEvent,
  LeadSource,
  ConsentStatus,
  OutboundChannel,
  ForecastCategory,
  QualificationChecklist,
} from "./CrmTypes.js";

// ═══════════════════════════════════════════════════════════════════
// LEAD SUBJECTS
// ═══════════════════════════════════════════════════════════════════

export class LeadCreated extends Subject implements CrmEvent {
  readonly visitName = "resolveLeadCreated" as const;
  constructor(
    public readonly eventId: string,
    public readonly organizationId: string,
    public readonly occurredAt: string,
    public readonly leadId: string,
    public readonly source: LeadSource,
    public readonly assignedToUserId: string | undefined,
    /** Free-form initial fields submitted at lead capture. */
    public readonly initialFields: Readonly<Record<string, string>>,
  ) {
    super();
  }
}

export class LeadAssigned extends Subject implements CrmEvent {
  readonly visitName = "resolveLeadAssigned" as const;
  constructor(
    public readonly eventId: string,
    public readonly organizationId: string,
    public readonly occurredAt: string,
    public readonly leadId: string,
    public readonly toUserId: string,
    public readonly fromUserId: string | undefined,
  ) {
    super();
  }
}

export class LeadQualified extends Subject implements CrmEvent {
  readonly visitName = "resolveLeadQualified" as const;
  constructor(
    public readonly eventId: string,
    public readonly organizationId: string,
    public readonly occurredAt: string,
    public readonly leadId: string,
    public readonly qualificationChecklist: QualificationChecklist,
    public readonly qualifiedByUserId: string,
  ) {
    super();
  }
}

export class LeadDisqualified extends Subject implements CrmEvent {
  readonly visitName = "resolveLeadDisqualified" as const;
  constructor(
    public readonly eventId: string,
    public readonly organizationId: string,
    public readonly occurredAt: string,
    public readonly leadId: string,
    public readonly reason: string,
    public readonly disqualifiedByUserId: string,
  ) {
    super();
  }
}

export class LeadConvertedToOpportunity extends Subject implements CrmEvent {
  readonly visitName = "resolveLeadConvertedToOpportunity" as const;
  constructor(
    public readonly eventId: string,
    public readonly organizationId: string,
    public readonly occurredAt: string,
    public readonly leadId: string,
    public readonly opportunityId: string,
    public readonly qualificationChecklist: QualificationChecklist,
    public readonly convertedByUserId: string,
  ) {
    super();
  }
}

// ═══════════════════════════════════════════════════════════════════
// OPPORTUNITY SUBJECTS
// ═══════════════════════════════════════════════════════════════════

export class OpportunityCreated extends Subject implements CrmEvent {
  readonly visitName = "resolveOpportunityCreated" as const;
  constructor(
    public readonly eventId: string,
    public readonly organizationId: string,
    public readonly occurredAt: string,
    public readonly opportunityId: string,
    public readonly accountId: string,
    public readonly name: string,
    /** Amount is always explicit — never invented or defaulted. */
    public readonly amount: number,
    public readonly expectedCloseDate: string,
    public readonly forecastCategory: ForecastCategory,
    public readonly createdByUserId: string,
  ) {
    super();
  }
}

export class StageTransitionRequested extends Subject implements CrmEvent {
  readonly visitName = "resolveStageTransitionRequested" as const;
  constructor(
    public readonly eventId: string,
    public readonly organizationId: string,
    public readonly occurredAt: string,
    public readonly opportunityId: string,
    public readonly fromStageKey: string,
    public readonly toStageKey: string,
    public readonly requestedByUserId: string,
    /** Provided field values for the transition gate check. */
    public readonly providedFields: Readonly<Record<string, string>>,
  ) {
    super();
  }
}

export class OpportunityAmountUpdated extends Subject implements CrmEvent {
  readonly visitName = "resolveOpportunityAmountUpdated" as const;
  constructor(
    public readonly eventId: string,
    public readonly organizationId: string,
    public readonly occurredAt: string,
    public readonly opportunityId: string,
    public readonly previousAmount: number,
    public readonly newAmount: number,
    public readonly updatedByUserId: string,
    public readonly justification: string | undefined,
  ) {
    super();
  }
}

export class OpportunityClosedWonRequested extends Subject implements CrmEvent {
  readonly visitName = "resolveOpportunityClosedWonRequested" as const;
  constructor(
    public readonly eventId: string,
    public readonly organizationId: string,
    public readonly occurredAt: string,
    public readonly opportunityId: string,
    public readonly requestedByUserId: string,
    public readonly contractRef: string | undefined,
    public readonly purchaseOrderRef: string | undefined,
  ) {
    super();
  }
}

export class OpportunityClosedLost extends Subject implements CrmEvent {
  readonly visitName = "resolveOpportunityClosedLost" as const;
  constructor(
    public readonly eventId: string,
    public readonly organizationId: string,
    public readonly occurredAt: string,
    public readonly opportunityId: string,
    public readonly reason: string,
    public readonly competitorKey: string | undefined,
    public readonly closedByUserId: string,
  ) {
    super();
  }
}

// ═══════════════════════════════════════════════════════════════════
// COMPLIANCE SUBJECTS
// ═══════════════════════════════════════════════════════════════════

export class ConsentUpdated extends Subject implements CrmEvent {
  readonly visitName = "resolveConsentUpdated" as const;
  constructor(
    public readonly eventId: string,
    public readonly organizationId: string,
    public readonly occurredAt: string,
    public readonly contactId: string,
    public readonly accountId: string,
    public readonly newStatus: ConsentStatus,
    public readonly method: string,
    public readonly source: string,
    public readonly updatedByUserId: string,
  ) {
    super();
  }
}

export class DoNotContactFlagged extends Subject implements CrmEvent {
  readonly visitName = "resolveDoNotContactFlagged" as const;
  constructor(
    public readonly eventId: string,
    public readonly organizationId: string,
    public readonly occurredAt: string,
    public readonly contactId: string,
    public readonly accountId: string,
    public readonly flaggedByUserId: string,
    public readonly reason: string | undefined,
  ) {
    super();
  }
}

export class OutboundAttempted extends Subject implements CrmEvent {
  readonly visitName = "resolveOutboundAttempted" as const;
  constructor(
    public readonly eventId: string,
    public readonly organizationId: string,
    public readonly occurredAt: string,
    public readonly contactId: string,
    public readonly accountId: string,
    public readonly channel: OutboundChannel,
    public readonly attemptedByUserId: string,
    public readonly opportunityId: string | undefined,
  ) {
    super();
  }
}

export class ComplianceOverrideRequested extends Subject implements CrmEvent {
  readonly visitName = "resolveComplianceOverrideRequested" as const;
  constructor(
    public readonly eventId: string,
    public readonly organizationId: string,
    public readonly occurredAt: string,
    public readonly contactId: string,
    public readonly accountId: string,
    public readonly overrideType: string,
    public readonly justification: string,
    public readonly requestedByUserId: string,
  ) {
    super();
  }
}

// ═══════════════════════════════════════════════════════════════════
// QUOTE / APPROVAL SUBJECTS
// ═══════════════════════════════════════════════════════════════════

export class QuoteCreated extends Subject implements CrmEvent {
  readonly visitName = "resolveQuoteCreated" as const;
  constructor(
    public readonly eventId: string,
    public readonly organizationId: string,
    public readonly occurredAt: string,
    public readonly quoteId: string,
    public readonly opportunityId: string,
    public readonly createdByUserId: string,
  ) {
    super();
  }
}

export class QuoteSubmittedForApproval extends Subject implements CrmEvent {
  readonly visitName = "resolveQuoteSubmittedForApproval" as const;
  constructor(
    public readonly eventId: string,
    public readonly organizationId: string,
    public readonly occurredAt: string,
    public readonly quoteId: string,
    public readonly opportunityId: string,
    public readonly submittedByUserId: string,
  ) {
    super();
  }
}

export class QuoteApproved extends Subject implements CrmEvent {
  readonly visitName = "resolveQuoteApproved" as const;
  constructor(
    public readonly eventId: string,
    public readonly organizationId: string,
    public readonly occurredAt: string,
    public readonly quoteId: string,
    public readonly opportunityId: string,
    public readonly approvedByUserId: string,
  ) {
    super();
  }
}

export class QuoteRejected extends Subject implements CrmEvent {
  readonly visitName = "resolveQuoteRejected" as const;
  constructor(
    public readonly eventId: string,
    public readonly organizationId: string,
    public readonly occurredAt: string,
    public readonly quoteId: string,
    public readonly opportunityId: string,
    public readonly rejectedByUserId: string,
    public readonly reason: string,
  ) {
    super();
  }
}

// ═══════════════════════════════════════════════════════════════════
// HANDOFF SUBJECTS
// ═══════════════════════════════════════════════════════════════════

export class HandoffGenerated extends Subject implements CrmEvent {
  readonly visitName = "resolveHandoffGenerated" as const;
  constructor(
    public readonly eventId: string,
    public readonly organizationId: string,
    public readonly occurredAt: string,
    public readonly handoffId: string,
    public readonly opportunityId: string,
    public readonly generatedByUserId: string,
  ) {
    super();
  }
}

export class HandoffAccepted extends Subject implements CrmEvent {
  readonly visitName = "resolveHandoffAccepted" as const;
  constructor(
    public readonly eventId: string,
    public readonly organizationId: string,
    public readonly occurredAt: string,
    public readonly handoffId: string,
    public readonly opportunityId: string,
    public readonly acceptedByUserId: string,
  ) {
    super();
  }
}

export class HandoffRejected extends Subject implements CrmEvent {
  readonly visitName = "resolveHandoffRejected" as const;
  constructor(
    public readonly eventId: string,
    public readonly organizationId: string,
    public readonly occurredAt: string,
    public readonly handoffId: string,
    public readonly opportunityId: string,
    public readonly rejectedByUserId: string,
    public readonly reason: string,
  ) {
    super();
  }
}
