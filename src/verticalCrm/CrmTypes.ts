/**
 * verticalCrm — Plain Domain Types
 *
 * Interfaces, enums, and value types used across all verticalCrm commands.
 * None of these participate in double dispatch (no visitName).
 *
 * @module verticalCrm/CrmTypes
 */

// ─── Primitive Enumerations ───────────────────────────────────────────────────

export type ConsentStatus = "OptIn" | "SoftOptIn" | "OptOut" | "Unknown";
export type AccountRiskFlag = "CreditHold" | "LegalHold" | "ComplianceHold";
export type StakeholderRole =
  | "EconomicBuyer"
  | "Champion"
  | "TechnicalEvaluator"
  | "Procurement"
  | "Legal"
  | "EndUser";
export type LeadSource = "Inbound" | "Outbound" | "Partner" | "Event" | "Import";
export type LeadStatus = "New" | "Working" | "Qualified" | "Disqualified" | "Converted";
export type ForecastCategory = "Pipeline" | "BestCase" | "Commit" | "Omitted";
export type ApprovalStatus = "NotRequired" | "Pending" | "Approved" | "Rejected";
export type HandoffStatus = "Draft" | "Ready" | "Accepted" | "Rejected" | "Completed";
export type OutboundChannel = "Email" | "Phone" | "SMS" | "InPerson";
export type QualificationFramework = "BANT" | "MEDDICC" | "Custom";
export type AiSuggestionChannel = "email" | "callScript" | "proposal" | "followUp";

// ─── Vertical Policy Structures ───────────────────────────────────────────────

export interface PolicyStageDefinition {
  readonly stageKey: string;
  readonly displayName: string;
  readonly order: number;
}

export interface PolicyTransition {
  readonly fromStageKey: string;
  readonly toStageKey: string;
}

export interface PolicyApprovalRule {
  readonly segment?: string;
  readonly productKey?: string;
  readonly discountThresholdPercent: number;
  readonly requiredApproverRole: string;
  readonly nonStandardTermsTrigger?: boolean;
  readonly marginFloorPercent?: number;
}

export interface PolicyComplianceRules {
  readonly allowedOutboundChannels: readonly OutboundChannel[];
  readonly dncOverrideAllowed: boolean;
  readonly dncOverrideRequiredRole?: string;
  readonly consentRequiredChannels: readonly OutboundChannel[];
  readonly ndaGatingEnabled: boolean;
}

export interface PolicyHandoffPlaybook {
  readonly requiredFields: readonly string[];
  readonly onboardingChecklistTemplateId?: string;
}

export interface PolicyQualificationFramework {
  readonly framework: QualificationFramework;
  readonly requiredKeys: readonly string[];
}

/**
 * Versioned, immutable policy configuration artifact.
 * Selected per organization — never branched on in code.
 *
 * Fail-closed invariant: if verticalPolicy is null, ValidateCrmEvent returns
 * POLICY_NOT_CONFIGURED and blocks all actions without silent defaults.
 */
export interface VerticalPolicy {
  readonly verticalPolicyId: string;
  readonly verticalKey: string;
  readonly version: string;
  readonly stages: readonly PolicyStageDefinition[];
  readonly transitions: readonly PolicyTransition[];
  /** Key: "fromStageKey->toStageKey"  Value: required field names for that transition */
  readonly requiredFieldsByTransition: Readonly<Record<string, readonly string[]>>;
  readonly approvalRules: readonly PolicyApprovalRule[];
  readonly complianceRules: PolicyComplianceRules;
  readonly handoffPlaybooks: readonly PolicyHandoffPlaybook[];
  readonly qualificationFramework: PolicyQualificationFramework;
  readonly closedWonRequiredFields: readonly string[];
  readonly permittedOverrides: readonly string[];
  readonly permittedOverriderRoles: readonly string[];
}

// ─── Snapshot Types ───────────────────────────────────────────────────────────

export interface AccountSnapshot {
  readonly accountId: string;
  readonly legalName: string;
  readonly segment?: string;
  readonly territory?: string;
  readonly industry?: string;
  readonly riskFlags: readonly AccountRiskFlag[];
  readonly activeNdaOnFile: boolean;
}

export interface StakeholderSnapshot {
  readonly contactId: string;
  readonly role: StakeholderRole;
  readonly authority: "High" | "Medium" | "Low";
  readonly influence: "High" | "Medium" | "Low";
}

export interface ContactSnapshot {
  readonly contactId: string;
  readonly accountId: string;
  readonly email?: string;
  readonly phone?: string;
  readonly consentStatus: ConsentStatus;
  readonly doNotContact: boolean;
  readonly consentEvidence?: {
    readonly timestamp: string;
    readonly method: string;
    readonly source: string;
  };
}

export interface QuoteLineItem {
  readonly productKey: string;
  readonly quantity: number;
  readonly unitPrice: number;
}

export interface OpportunitySnapshot {
  readonly opportunityId: string;
  readonly accountId: string;
  readonly name: string;
  readonly amount: number;
  readonly expectedCloseDate: string;
  readonly stageKey: string;
  readonly forecastCategory: ForecastCategory;
  readonly productLineItemIds: readonly string[];
  readonly buyingCommittee: readonly StakeholderSnapshot[];
}

export interface QuoteSnapshot {
  readonly quoteId: string;
  readonly opportunityId: string;
  readonly lineItems: readonly QuoteLineItem[];
  readonly discountPercent: number;
  readonly nonStandardTerms: readonly string[];
  readonly approvalStatus: ApprovalStatus;
  readonly marginPercent?: number;
}

export interface HandoffSnapshot {
  readonly handoffId: string;
  readonly opportunityId: string;
  readonly scope?: string;
  readonly billingDetails?: string;
  readonly startDate?: string;
  readonly keyStakeholderIds: readonly string[];
  readonly completedChecklistItems: readonly string[];
  readonly status: HandoffStatus;
}

export interface QualificationChecklist {
  readonly framework: QualificationFramework;
  readonly completedKeys: readonly string[];
}

export interface LeadSnapshot {
  readonly leadId: string;
  readonly source: LeadSource;
  readonly status: LeadStatus;
  readonly assignedToUserId?: string;
  readonly qualificationChecklist?: QualificationChecklist;
}

export interface CrmStateSnapshots {
  readonly account?: AccountSnapshot;
  readonly contact?: ContactSnapshot;
  readonly opportunity?: OpportunitySnapshot;
  readonly quote?: QuoteSnapshot;
  readonly handoff?: HandoffSnapshot;
  readonly lead?: LeadSnapshot;
}

// ─── Actor & Authorization ─────────────────────────────────────────────────────

export interface Actor {
  readonly userId: string;
  readonly organizationId: string;
  readonly roles: readonly string[];
}

// ─── ValidationObject (Command object for ValidateCrmEvent) ──────────────────

/** Full validation context passed to every ValidateCrmEvent visit method. */
export interface ValidationObject {
  readonly actor: Actor;
  /** null = no policy configured → POLICY_NOT_CONFIGURED blocks everything */
  readonly verticalPolicy: VerticalPolicy | null;
  readonly snapshots: CrmStateSnapshots;
  readonly requestedAction: string;
  readonly requestedStageKey?: string;
  readonly targetContactId?: string;
  readonly requestedChannel?: OutboundChannel;
  readonly overrideJustification?: string;
}

// ─── ValidationOutcome (return type for ValidateCrmEvent) ────────────────────

export interface BlockedReason {
  readonly code: string;
  readonly message: string;
}

export interface RequiredApproval {
  readonly type: string;
  readonly ownerRole: string;
}

export interface RequiredEvidence {
  readonly type: string;
  readonly description: string;
}

/** Deterministic, policy-driven validation result. */
export interface ValidationOutcome {
  readonly allowed: boolean;
  readonly blockedReasons: readonly BlockedReason[];
  readonly missingFields: readonly string[];
  readonly requiredApprovals: readonly RequiredApproval[];
  readonly requiredEvidence: readonly RequiredEvidence[];
}

// ─── ApplicationObject (Command object for ApplyCrmEvent) ────────────────────

export interface AuditEventRecord {
  readonly who: string;
  readonly what: string;
  readonly when: string;
  readonly beforeStageKey?: string;
  readonly afterStageKey?: string;
  readonly policyVersion: string;
  readonly policyId: string;
}

/** Committed state changes, audit trail, and queued side-effects. */
export interface ApplicationOutcome {
  readonly updatedIds: Readonly<Record<string, string>>;
  readonly auditEventIds: readonly string[];
  readonly queuedActions: readonly string[];
}

// ─── Repository Interfaces ────────────────────────────────────────────────────

export interface OppRepository {
  updateStage(opportunityId: string, stageKey: string): Promise<void>;
  updateAmount(opportunityId: string, amount: number): Promise<void>;
  closeWon(opportunityId: string, contractRef?: string): Promise<void>;
  closeLost(opportunityId: string, reason: string): Promise<void>;
}

export interface QuoteRepository {
  create(opportunityId: string): Promise<string>;
  updateApprovalStatus(quoteId: string, status: ApprovalStatus): Promise<void>;
}

export interface AuditRepository {
  record(event: AuditEventRecord): Promise<string>;
}

export interface ConsentRepository {
  updateConsent(
    contactId: string,
    status: ConsentStatus,
    evidence: { method: string; source: string },
  ): Promise<void>;
  flagDoNotContact(contactId: string): Promise<void>;
  recordOverride(contactId: string, approvedBy: string, justification: string): Promise<void>;
}

export interface HandoffRepository {
  create(opportunityId: string): Promise<string>;
  updateStatus(handoffId: string, status: HandoffStatus): Promise<void>;
}

export interface LeadRepository {
  assign(leadId: string, userId: string): Promise<void>;
  qualify(leadId: string): Promise<void>;
  disqualify(leadId: string, reason: string): Promise<void>;
  convert(leadId: string, opportunityId: string): Promise<void>;
}

export interface AiRepository {
  saveDraft(organizationId: string, artifact: AiDraftArtifact): Promise<string>;
  saveProposedUpdates(
    organizationId: string,
    updates: readonly AiProposedUpdate[],
  ): Promise<string>;
  recordSuggestionAccepted(suggestionId: string, approvedBy: string): Promise<void>;
  recordSuggestionRejected(suggestionId: string, rejectedBy: string): Promise<void>;
}

// ─── Port Interfaces ──────────────────────────────────────────────────────────

export interface NotificationPort {
  notify(userId: string, message: string): Promise<void>;
  notifyRole(organizationId: string, role: string, message: string): Promise<void>;
}

export interface IntegrationPort {
  enqueue(action: string, payload: Record<string, unknown>): Promise<void>;
}

export interface LlmPort {
  generate(promptKey: string, context: Record<string, unknown>): Promise<string>;
}

/** Full application context — repositories, side-effect ports, and provenance. */
export interface ApplicationObject {
  /** Hard invariant: allowed must be true. Apply is forbidden if validation was blocked. */
  readonly validationResult: ValidationOutcome;
  readonly repos: {
    readonly opp: OppRepository;
    readonly quote: QuoteRepository;
    readonly audit: AuditRepository;
    readonly consent: ConsentRepository;
    readonly handoff: HandoffRepository;
    readonly lead: LeadRepository;
    readonly ai: AiRepository;
  };
  readonly ports: {
    readonly notifications: NotificationPort;
    readonly integrations: IntegrationPort;
    readonly llm: LlmPort;
  };
  /** Original validation context — used for audit provenance (policy version, actor). */
  readonly validationContext: ValidationObject;
}

// ─── AI Value Types ───────────────────────────────────────────────────────────

export interface AiDraftArtifact {
  readonly channel: AiSuggestionChannel;
  readonly subject?: string;
  readonly body: string;
  readonly tone?: string;
  readonly personalizationFactors: readonly string[];
  /** Compliance warnings (e.g. "contact is opt-out — draft only, sending blocked"). */
  readonly riskWarnings: readonly string[];
}

export interface AiProposedUpdate {
  readonly fieldPath: string;
  readonly proposedValue: unknown;
  readonly evidenceSnippets: readonly string[];
  readonly confidence: "High" | "Medium" | "Low";
  readonly policyImpact?: string;
}

export interface AiSuggestionApproval {
  readonly suggestionId: string;
  readonly approvedBy: string;
  readonly approvedAt: string;
}

// ─── Base Event Interface (Command's B parameter) ─────────────────────────────

/** Shared identity every CRM event Subject must carry. */
export interface CrmEvent {
  readonly eventId: string;
  readonly organizationId: string;
  readonly occurredAt: string;
}
