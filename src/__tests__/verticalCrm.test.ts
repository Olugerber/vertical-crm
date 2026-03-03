/**
 * verticalCrm — Domain Tests
 *
 * Exercises the two Commands against a minimal stub VerticalPolicy.
 * Covers: fail-closed policy guard, stage transition validation,
 * DNC compliance block, quote approval trigger, ClosedWon gating,
 * and apply-requires-allowed invariant.
 */

import { ValidateCrmEvent } from "../verticalCrm/commands/ValidateCrmEvent.js";
import { ApplyCrmEvent } from "../verticalCrm/commands/ApplyCrmEvent.js";
import {
  LeadCreated,
  LeadQualified,
  StageTransitionRequested,
  OutboundAttempted,
  OpportunityClosedWonRequested,
  QuoteSubmittedForApproval,
  LeadDisqualified,
  OpportunityCreated,
  HandoffAccepted,
  HandoffRejected,
  OpportunityClosedLost,
} from "../verticalCrm/CrmSubjects.js";
import { AiDraftRequested, AiSuggestionAccepted } from "../verticalCrm/AiSubjects.js";
import type {
  VerticalPolicy,
  ValidationObject,
  ApplicationObject,
  ValidationOutcome,
  OppRepository,
  QuoteRepository,
  AuditRepository,
  ConsentRepository,
  HandoffRepository,
  LeadRepository,
  AiRepository,
  NotificationPort,
  IntegrationPort,
  LlmPort,
  CrmStateSnapshots,
  Actor,
  AiSuggestionApproval,
} from "../verticalCrm/CrmTypes.js";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const POLICY: VerticalPolicy = {
  verticalPolicyId: "policy-saas-v1",
  verticalKey: "saas",
  version: "1.0",
  stages: [
    { stageKey: "Prospect", displayName: "Prospect", order: 1 },
    { stageKey: "Qualified", displayName: "Qualified", order: 2 },
    { stageKey: "Proposal", displayName: "Proposal", order: 3 },
    { stageKey: "Negotiation", displayName: "Negotiation", order: 4 },
    { stageKey: "ClosedWon", displayName: "Closed Won", order: 5 },
    { stageKey: "ClosedLost", displayName: "Closed Lost", order: 5 },
  ],
  transitions: [
    { fromStageKey: "Prospect", toStageKey: "Qualified" },
    { fromStageKey: "Qualified", toStageKey: "Proposal" },
    { fromStageKey: "Proposal", toStageKey: "Negotiation" },
    { fromStageKey: "Negotiation", toStageKey: "ClosedWon" },
    { fromStageKey: "Negotiation", toStageKey: "ClosedLost" },
  ],
  requiredFieldsByTransition: {
    "Prospect->Qualified": ["budget", "timeline"],
    "Qualified->Proposal": ["proposalSentDate"],
  },
  approvalRules: [
    { discountThresholdPercent: 20, requiredApproverRole: "SalesDirector" },
  ],
  complianceRules: {
    allowedOutboundChannels: ["Email", "Phone"],
    dncOverrideAllowed: true,
    dncOverrideRequiredRole: "ComplianceOfficer",
    consentRequiredChannels: ["Email"],
    ndaGatingEnabled: false,
  },
  handoffPlaybooks: [
    { requiredFields: ["scope", "billingDetails", "startDate"] },
  ],
  qualificationFramework: {
    framework: "BANT",
    requiredKeys: ["budget", "authority", "need", "timeline"],
  },
  closedWonRequiredFields: ["contractRef"],
  permittedOverrides: ["DNCOverride"],
  permittedOverriderRoles: ["ComplianceOfficer"],
};

const ACTOR: Actor = { userId: "user-1", organizationId: "org-1", roles: ["AE"] };
const DIRECTOR_ACTOR: Actor = { userId: "user-2", organizationId: "org-1", roles: ["SalesDirector"] };

function makeEvent(overrides?: Partial<{ eventId: string; organizationId: string; occurredAt: string }>) {
  return { eventId: "evt-1", organizationId: "org-1", occurredAt: "2026-03-01T00:00:00Z", ...overrides };
}

function validationObject(
  overrides: Partial<ValidationObject> = {},
  snapshots: CrmStateSnapshots = {},
): ValidationObject {
  return {
    actor: ACTOR,
    verticalPolicy: POLICY,
    snapshots,
    requestedAction: "test",
    ...overrides,
  };
}

// ─── Repository / Port Stubs ──────────────────────────────────────────────────

function makeRepos(): ApplicationObject["repos"] {
  const noop = async () => {};
  const oppRepo: OppRepository = {
    updateStage: jest.fn(async () => {}),
    updateAmount: jest.fn(async () => {}),
    closeWon: jest.fn(async () => {}),
    closeLost: jest.fn(async () => {}),
  };
  const quoteRepo: QuoteRepository = {
    create: jest.fn(async () => "quote-new"),
    updateApprovalStatus: jest.fn(async () => {}),
  };
  const auditRepo: AuditRepository = {
    record: jest.fn(async () => "audit-1"),
  };
  const consentRepo: ConsentRepository = {
    updateConsent: jest.fn(async () => {}),
    flagDoNotContact: jest.fn(async () => {}),
    recordOverride: jest.fn(async () => {}),
  };
  const handoffRepo: HandoffRepository = {
    create: jest.fn(async () => "handoff-new"),
    updateStatus: jest.fn(async () => {}),
  };
  const leadRepo: LeadRepository = {
    assign: jest.fn(async () => {}),
    qualify: jest.fn(async () => {}),
    disqualify: jest.fn(async () => {}),
    convert: jest.fn(async () => {}),
  };
  const aiRepo: AiRepository = {
    saveDraft: jest.fn(async () => "draft-1"),
    saveProposedUpdates: jest.fn(async () => "batch-1"),
    recordSuggestionAccepted: jest.fn(async () => {}),
    recordSuggestionRejected: jest.fn(async () => {}),
  };
  return { opp: oppRepo, quote: quoteRepo, audit: auditRepo, consent: consentRepo, handoff: handoffRepo, lead: leadRepo, ai: aiRepo };
}

function makePorts(): ApplicationObject["ports"] {
  return {
    notifications: { notify: jest.fn(async () => {}), notifyRole: jest.fn(async () => {}) },
    integrations: { enqueue: jest.fn(async () => {}) },
    llm: { generate: jest.fn(async () => "Dear Alice, ...") },
  };
}

function applyObject(
  validationResult: ValidationOutcome,
  snapshots: CrmStateSnapshots = {},
): ApplicationObject {
  return {
    validationResult,
    repos: makeRepos(),
    ports: makePorts(),
    validationContext: validationObject({}, snapshots),
  };
}

// ─── Command instances ────────────────────────────────────────────────────────

const validate = new ValidateCrmEvent();
const apply = new ApplyCrmEvent();

// ═══════════════════════════════════════════════════════════════════
// ValidateCrmEvent — Fail-Closed Policy Guard
// ═══════════════════════════════════════════════════════════════════

describe("ValidateCrmEvent — fail-closed policy guard", () => {
  test("blocks any event when verticalPolicy is null", () => {
    const subject = new LeadCreated(
      ...Object.values(makeEvent()) as [string, string, string],
      "lead-1", "Inbound", undefined, {},
    );
    const result = validate.run(subject, validationObject({ verticalPolicy: null }));
    expect(result.allowed).toBe(false);
    expect(result.blockedReasons[0]?.code).toBe("POLICY_NOT_CONFIGURED");
  });
});

// ═══════════════════════════════════════════════════════════════════
// ValidateCrmEvent — Lead
// ═══════════════════════════════════════════════════════════════════

describe("ValidateCrmEvent — Lead", () => {
  test("LeadCreated passes with a source", () => {
    const subject = new LeadCreated("evt-1", "org-1", "2026-03-01T00:00:00Z", "lead-1", "Inbound", undefined, {});
    expect(validate.run(subject, validationObject()).allowed).toBe(true);
  });

  test("LeadQualified fails when BANT checklist is incomplete", () => {
    const subject = new LeadQualified("evt-1", "org-1", "2026-03-01T00:00:00Z", "lead-1",
      { framework: "BANT", completedKeys: ["budget", "authority"] }, // missing need + timeline
      "user-1",
    );
    const result = validate.run(subject, validationObject());
    expect(result.allowed).toBe(false);
    expect(result.blockedReasons[0]?.code).toBe("QUALIFICATION_INCOMPLETE");
    expect(result.missingFields).toContain("need");
    expect(result.missingFields).toContain("timeline");
  });

  test("LeadQualified passes when full BANT checklist is provided", () => {
    const subject = new LeadQualified("evt-1", "org-1", "2026-03-01T00:00:00Z", "lead-1",
      { framework: "BANT", completedKeys: ["budget", "authority", "need", "timeline"] },
      "user-1",
    );
    expect(validate.run(subject, validationObject()).allowed).toBe(true);
  });

  test("LeadDisqualified requires a reason", () => {
    const subject = new LeadDisqualified("evt-1", "org-1", "2026-03-01T00:00:00Z", "lead-1", "", "user-1");
    const result = validate.run(subject, validationObject());
    expect(result.allowed).toBe(false);
    expect(result.blockedReasons[0]?.code).toBe("DISQUALIFICATION_REASON_REQUIRED");
  });
});

// ═══════════════════════════════════════════════════════════════════
// ValidateCrmEvent — Stage Transitions
// ═══════════════════════════════════════════════════════════════════

describe("ValidateCrmEvent — StageTransitionRequested", () => {
  test("passes for a permitted transition with required fields", () => {
    const subject = new StageTransitionRequested(
      "evt-1", "org-1", "2026-03-01T00:00:00Z",
      "opp-1", "Prospect", "Qualified", "user-1",
      { budget: "50000", timeline: "Q2" },
    );
    expect(validate.run(subject, validationObject()).allowed).toBe(true);
  });

  test("blocks a transition not in policy.transitions", () => {
    const subject = new StageTransitionRequested(
      "evt-1", "org-1", "2026-03-01T00:00:00Z",
      "opp-1", "Prospect", "ClosedWon", "user-1", {},
    );
    const result = validate.run(subject, validationObject());
    expect(result.allowed).toBe(false);
    expect(result.blockedReasons[0]?.code).toBe("TRANSITION_NOT_PERMITTED");
  });

  test("blocks a valid transition when required fields are missing", () => {
    const subject = new StageTransitionRequested(
      "evt-1", "org-1", "2026-03-01T00:00:00Z",
      "opp-1", "Prospect", "Qualified", "user-1",
      { budget: "50000" }, // missing timeline
    );
    const result = validate.run(subject, validationObject());
    expect(result.allowed).toBe(false);
    expect(result.missingFields).toContain("timeline");
  });
});

// ═══════════════════════════════════════════════════════════════════
// ValidateCrmEvent — Compliance (DNC / Outbound)
// ═══════════════════════════════════════════════════════════════════

describe("ValidateCrmEvent — Compliance", () => {
  test("OutboundAttempted passes for opted-in contact on allowed channel", () => {
    const subject = new OutboundAttempted("evt-1", "org-1", "2026-03-01T00:00:00Z",
      "contact-1", "account-1", "Email", "user-1", undefined,
    );
    const snapshots: CrmStateSnapshots = {
      contact: { contactId: "contact-1", accountId: "account-1", consentStatus: "OptIn", doNotContact: false },
    };
    expect(validate.run(subject, validationObject({}, snapshots)).allowed).toBe(true);
  });

  test("OutboundAttempted hard-blocks when doNotContact is true", () => {
    const subject = new OutboundAttempted("evt-1", "org-1", "2026-03-01T00:00:00Z",
      "contact-1", "account-1", "Email", "user-1", undefined,
    );
    const snapshots: CrmStateSnapshots = {
      contact: { contactId: "contact-1", accountId: "account-1", consentStatus: "OptIn", doNotContact: true },
    };
    const result = validate.run(subject, validationObject({}, snapshots));
    expect(result.allowed).toBe(false);
    expect(result.blockedReasons[0]?.code).toBe("DNC_CONTACT_BLOCKED");
  });

  test("OutboundAttempted hard-blocks when consentStatus is OptOut", () => {
    const subject = new OutboundAttempted("evt-1", "org-1", "2026-03-01T00:00:00Z",
      "contact-1", "account-1", "Email", "user-1", undefined,
    );
    const snapshots: CrmStateSnapshots = {
      contact: { contactId: "contact-1", accountId: "account-1", consentStatus: "OptOut", doNotContact: false },
    };
    const result = validate.run(subject, validationObject({}, snapshots));
    expect(result.allowed).toBe(false);
    expect(result.blockedReasons[0]?.code).toBe("CONSENT_OPT_OUT_BLOCKED");
  });

  test("OutboundAttempted blocks on a channel not in policy.allowedOutboundChannels", () => {
    const subject = new OutboundAttempted("evt-1", "org-1", "2026-03-01T00:00:00Z",
      "contact-1", "account-1", "SMS", "user-1", undefined, // SMS not in policy
    );
    const snapshots: CrmStateSnapshots = {
      contact: { contactId: "contact-1", accountId: "account-1", consentStatus: "OptIn", doNotContact: false },
    };
    const result = validate.run(subject, validationObject({}, snapshots));
    expect(result.allowed).toBe(false);
    expect(result.blockedReasons[0]?.code).toBe("CHANNEL_NOT_PERMITTED");
  });

  test("OutboundAttempted blocks Email when consentStatus is not OptIn", () => {
    const subject = new OutboundAttempted("evt-1", "org-1", "2026-03-01T00:00:00Z",
      "contact-1", "account-1", "Email", "user-1", undefined,
    );
    const snapshots: CrmStateSnapshots = {
      contact: { contactId: "contact-1", accountId: "account-1", consentStatus: "Unknown", doNotContact: false },
    };
    const result = validate.run(subject, validationObject({}, snapshots));
    expect(result.allowed).toBe(false);
    expect(result.blockedReasons[0]?.code).toBe("CONSENT_REQUIRED_FOR_CHANNEL");
  });
});

// ═══════════════════════════════════════════════════════════════════
// ValidateCrmEvent — Quote Approvals
// ═══════════════════════════════════════════════════════════════════

describe("ValidateCrmEvent — Quote submission approval trigger", () => {
  test("passes when discount is below threshold", () => {
    const subject = new QuoteSubmittedForApproval("evt-1", "org-1", "2026-03-01T00:00:00Z", "q-1", "opp-1", "user-1");
    const snapshots: CrmStateSnapshots = {
      opportunity: { opportunityId: "opp-1", accountId: "acc-1", name: "Deal", amount: 100000, expectedCloseDate: "2026-06-01", stageKey: "Proposal", forecastCategory: "Commit", productLineItemIds: [], buyingCommittee: [] },
      quote: { quoteId: "q-1", opportunityId: "opp-1", lineItems: [{ productKey: "p1", quantity: 1, unitPrice: 10000 }], discountPercent: 10, nonStandardTerms: [], approvalStatus: "NotRequired" },
    };
    expect(validate.run(subject, validationObject({}, snapshots)).allowed).toBe(true);
  });

  test("blocks and adds requiredApprovals when discount exceeds threshold", () => {
    const subject = new QuoteSubmittedForApproval("evt-1", "org-1", "2026-03-01T00:00:00Z", "q-1", "opp-1", "user-1");
    const snapshots: CrmStateSnapshots = {
      opportunity: { opportunityId: "opp-1", accountId: "acc-1", name: "Deal", amount: 100000, expectedCloseDate: "2026-06-01", stageKey: "Proposal", forecastCategory: "Commit", productLineItemIds: [], buyingCommittee: [] },
      quote: { quoteId: "q-1", opportunityId: "opp-1", lineItems: [{ productKey: "p1", quantity: 1, unitPrice: 10000 }], discountPercent: 25, nonStandardTerms: [], approvalStatus: "NotRequired" }, // 25% > 20% threshold
    };
    const result = validate.run(subject, validationObject({}, snapshots));
    expect(result.allowed).toBe(false);
    expect(result.blockedReasons[0]?.code).toBe("APPROVAL_REQUIRED");
    expect(result.requiredApprovals[0]?.ownerRole).toBe("SalesDirector");
  });
});

// ═══════════════════════════════════════════════════════════════════
// ValidateCrmEvent — ClosedWon Gating
// ═══════════════════════════════════════════════════════════════════

describe("ValidateCrmEvent — ClosedWon gating", () => {
  test("blocks when quote is not approved", () => {
    const subject = new OpportunityClosedWonRequested("evt-1", "org-1", "2026-03-01T00:00:00Z",
      "opp-1", "user-1", "contract-123", undefined,
    );
    const snapshots: CrmStateSnapshots = {
      quote: { quoteId: "q-1", opportunityId: "opp-1", lineItems: [], discountPercent: 0, nonStandardTerms: [], approvalStatus: "Pending" },
      handoff: { handoffId: "h-1", opportunityId: "opp-1", keyStakeholderIds: [], completedChecklistItems: [], status: "Ready" },
    };
    const result = validate.run(subject, validationObject({}, snapshots));
    expect(result.allowed).toBe(false);
    expect(result.blockedReasons.some((r) => r.code === "QUOTE_NOT_APPROVED")).toBe(true);
  });

  test("blocks when handoff is not ready", () => {
    const subject = new OpportunityClosedWonRequested("evt-1", "org-1", "2026-03-01T00:00:00Z",
      "opp-1", "user-1", "contract-123", undefined,
    );
    const snapshots: CrmStateSnapshots = {
      quote: { quoteId: "q-1", opportunityId: "opp-1", lineItems: [], discountPercent: 0, nonStandardTerms: [], approvalStatus: "Approved" },
      handoff: { handoffId: "h-1", opportunityId: "opp-1", keyStakeholderIds: [], completedChecklistItems: [], status: "Draft" },
    };
    const result = validate.run(subject, validationObject({}, snapshots));
    expect(result.allowed).toBe(false);
    expect(result.blockedReasons.some((r) => r.code === "HANDOFF_NOT_READY")).toBe(true);
  });

  test("passes when quote is approved, handoff is ready, and contractRef is present", () => {
    const subject = new OpportunityClosedWonRequested("evt-1", "org-1", "2026-03-01T00:00:00Z",
      "opp-1", "user-1", "contract-123", undefined,
    );
    const snapshots: CrmStateSnapshots = {
      quote: { quoteId: "q-1", opportunityId: "opp-1", lineItems: [], discountPercent: 0, nonStandardTerms: [], approvalStatus: "Approved" },
      handoff: { handoffId: "h-1", opportunityId: "opp-1", keyStakeholderIds: [], completedChecklistItems: [], status: "Ready" },
    };
    expect(validate.run(subject, validationObject({}, snapshots)).allowed).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════
// ValidateCrmEvent — Handoff Acceptance
// ═══════════════════════════════════════════════════════════════════

describe("ValidateCrmEvent — HandoffAccepted", () => {
  test("blocks when required checklist items are missing", () => {
    const subject = new HandoffAccepted("evt-1", "org-1", "2026-03-01T00:00:00Z", "h-1", "opp-1", "user-1");
    const snapshots: CrmStateSnapshots = {
      handoff: { handoffId: "h-1", opportunityId: "opp-1", keyStakeholderIds: [], completedChecklistItems: ["scope"], status: "Ready" }, // missing billingDetails, startDate
    };
    const result = validate.run(subject, validationObject({}, snapshots));
    expect(result.allowed).toBe(false);
    expect(result.missingFields).toContain("billingDetails");
    expect(result.missingFields).toContain("startDate");
  });

  test("passes when all required checklist items are present", () => {
    const subject = new HandoffAccepted("evt-1", "org-1", "2026-03-01T00:00:00Z", "h-1", "opp-1", "user-1");
    const snapshots: CrmStateSnapshots = {
      handoff: { handoffId: "h-1", opportunityId: "opp-1", keyStakeholderIds: [], completedChecklistItems: ["scope", "billingDetails", "startDate"], status: "Ready" },
    };
    expect(validate.run(subject, validationObject({}, snapshots)).allowed).toBe(true);
  });

  test("HandoffRejected always passes", () => {
    const subject = new HandoffRejected("evt-1", "org-1", "2026-03-01T00:00:00Z", "h-1", "opp-1", "user-1", "Missing scope");
    expect(validate.run(subject, validationObject()).allowed).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════
// ValidateCrmEvent — AI Events
// ═══════════════════════════════════════════════════════════════════

describe("ValidateCrmEvent — AI events", () => {
  test("AiDraftRequested always passes (drafting is non-canonical)", () => {
    const subject = new AiDraftRequested("evt-1", "org-1", "2026-03-01T00:00:00Z", "user-1", "email", "opp-1", "contact-1", undefined);
    expect(validate.run(subject, validationObject()).allowed).toBe(true);
  });

  test("AiSuggestionAccepted requires explicit approvedBy and approvedAt", () => {
    const badApproval: AiSuggestionApproval = { suggestionId: "s-1", approvedBy: "", approvedAt: "" };
    const subject = new AiSuggestionAccepted("evt-1", "org-1", "2026-03-01T00:00:00Z", "s-1", "opp-1", badApproval, "gpt-4o", "tmpl-1");
    const result = validate.run(subject, validationObject());
    expect(result.allowed).toBe(false);
    expect(result.blockedReasons[0]?.code).toBe("SUGGESTION_APPROVAL_MISSING");
  });

  test("AiSuggestionAccepted passes with valid approval metadata", () => {
    const approval: AiSuggestionApproval = { suggestionId: "s-1", approvedBy: "user-1", approvedAt: "2026-03-01T00:00:00Z" };
    const subject = new AiSuggestionAccepted("evt-1", "org-1", "2026-03-01T00:00:00Z", "s-1", "opp-1", approval, "gpt-4o", "tmpl-1");
    expect(validate.run(subject, validationObject()).allowed).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════
// ApplyCrmEvent — apply-requires-allowed invariant
// ═══════════════════════════════════════════════════════════════════

describe("ApplyCrmEvent — hard invariant: apply forbidden when blocked", () => {
  test("throws when validationResult.allowed is false", async () => {
    const subject = new OpportunityClosedLost("evt-1", "org-1", "2026-03-01T00:00:00Z", "opp-1", "Lost to competitor", "Acme", "user-1");
    const blockedOutcome: ValidationOutcome = {
      allowed: false,
      blockedReasons: [{ code: "SOME_BLOCK", message: "Blocked." }],
      missingFields: [],
      requiredApprovals: [],
      requiredEvidence: [],
    };
    // assertAllowed throws synchronously before the async body runs
    expect(() => apply.run(subject, applyObject(blockedOutcome))).toThrow(
      "ApplyCrmEvent is forbidden",
    );
  });
});

// ═══════════════════════════════════════════════════════════════════
// ApplyCrmEvent — state mutations and audit records
// ═══════════════════════════════════════════════════════════════════

describe("ApplyCrmEvent — mutations and audit trail", () => {
  const passedOutcome: ValidationOutcome = {
    allowed: true, blockedReasons: [], missingFields: [], requiredApprovals: [], requiredEvidence: [],
  };

  test("ApplyOpportunityCreated writes an audit record and returns opportunityId", async () => {
    const subject = new OpportunityCreated("evt-1", "org-1", "2026-03-01T00:00:00Z",
      "opp-99", "acc-1", "Big Deal", 500000, "2026-06-30", "Commit", "user-1",
    );
    const obj = applyObject(passedOutcome);
    const result = await apply.run(subject, obj);
    expect(result.auditEventIds).toHaveLength(1);
    expect(result.updatedIds["opportunityId"]).toBe("opp-99");
    expect(obj.repos.audit.record).toHaveBeenCalledTimes(1);
  });

  test("ApplyStageTransition calls opp.updateStage and records before/after stage", async () => {
    const subject = new StageTransitionRequested("evt-1", "org-1", "2026-03-01T00:00:00Z",
      "opp-1", "Prospect", "Qualified", "user-1", { budget: "50000", timeline: "Q2" },
    );
    const obj = applyObject(passedOutcome);
    const result = await apply.run(subject, obj);
    expect(obj.repos.opp.updateStage).toHaveBeenCalledWith("opp-1", "Qualified");
    expect(result.auditEventIds).toHaveLength(1);
  });

  test("ApplyClosedWon calls opp.closeWon, enqueues integration, and writes audit", async () => {
    const subject = new OpportunityClosedWonRequested("evt-1", "org-1", "2026-03-01T00:00:00Z",
      "opp-1", "user-1", "contract-123", undefined,
    );
    const obj = applyObject(passedOutcome);
    const result = await apply.run(subject, obj);
    expect(obj.repos.opp.closeWon).toHaveBeenCalledWith("opp-1", "contract-123");
    expect(obj.ports.integrations.enqueue).toHaveBeenCalledWith("opportunity.closed_won", expect.any(Object));
    expect(result.queuedActions).toContain("integration:closed_won");
  });

  test("ApplyHandoffAccepted updates status to Accepted and enqueues integration", async () => {
    const subject = new HandoffAccepted("evt-1", "org-1", "2026-03-01T00:00:00Z", "h-1", "opp-1", "user-1");
    const obj = applyObject(passedOutcome);
    await apply.run(subject, obj);
    expect(obj.repos.handoff.updateStatus).toHaveBeenCalledWith("h-1", "Accepted");
    expect(obj.ports.integrations.enqueue).toHaveBeenCalledWith("handoff.accepted", expect.any(Object));
  });

  test("ApplyAiDraftRequest calls llm.generate and saves draft artifact", async () => {
    const subject = new AiDraftRequested("evt-1", "org-1", "2026-03-01T00:00:00Z",
      "user-1", "email", "opp-1", "contact-1", "Proposal",
    );
    const obj = applyObject(passedOutcome);
    const result = await apply.run(subject, obj);
    expect(obj.ports.llm.generate).toHaveBeenCalledWith("draft:email", expect.any(Object));
    expect(obj.repos.ai.saveDraft).toHaveBeenCalled();
    expect(result.updatedIds["draftId"]).toBe("draft-1");
  });
});
