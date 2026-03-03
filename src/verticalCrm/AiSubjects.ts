/**
 * verticalCrm — AI Event Subjects
 *
 * Subject classes for AI-assistant events. These are intentionally separate
 * from core CRM subjects so that different safety rules can be applied
 * (advisory-only, no silent canonical writes, always human-confirmed).
 *
 * All AI subjects implement CrmEvent to participate in the same Command
 * dispatch cycle as core subjects.
 *
 * @module verticalCrm/AiSubjects
 */

import { Subject } from "codascon";
import type { CrmEvent, AiSuggestionChannel, AiProposedUpdate, AiSuggestionApproval } from "./CrmTypes.js";

// ═══════════════════════════════════════════════════════════════════
// AI EVENT SUBJECTS
// ═══════════════════════════════════════════════════════════════════

/**
 * A seller has requested an AI-generated draft (email, call script, proposal).
 * Output is a non-canonical artifact until the user explicitly sends/approves.
 */
export class AiDraftRequested extends Subject implements CrmEvent {
  readonly visitName = "resolveAiDraftRequested" as const;
  constructor(
    public readonly eventId: string,
    public readonly organizationId: string,
    public readonly occurredAt: string,
    public readonly requestedByUserId: string,
    public readonly channel: AiSuggestionChannel,
    public readonly opportunityId: string | undefined,
    public readonly contactId: string | undefined,
    /** Current stage context for prompt personalisation (read-only, not written). */
    public readonly stageContext: string | undefined,
  ) {
    super();
  }
}

/**
 * A meeting transcript or unstructured notes have been ingested for extraction.
 * AI will produce proposed (not canonical) field updates.
 */
export class AiNotesIngested extends Subject implements CrmEvent {
  readonly visitName = "resolveAiNotesIngested" as const;
  constructor(
    public readonly eventId: string,
    public readonly organizationId: string,
    public readonly occurredAt: string,
    public readonly ingestedByUserId: string,
    public readonly meetingId: string,
    public readonly opportunityId: string | undefined,
    public readonly transcriptLength: number,
  ) {
    super();
  }
}

/**
 * AI has finished generating proposed updates from meeting notes.
 * Each proposed update requires explicit human acceptance.
 */
export class AiProposedUpdatesGenerated extends Subject implements CrmEvent {
  readonly visitName = "resolveAiProposedUpdatesGenerated" as const;
  constructor(
    public readonly eventId: string,
    public readonly organizationId: string,
    public readonly occurredAt: string,
    public readonly meetingId: string,
    public readonly opportunityId: string | undefined,
    public readonly proposedUpdates: readonly AiProposedUpdate[],
    public readonly aiModelId: string,
    public readonly promptTemplateId: string,
  ) {
    super();
  }
}

/**
 * A seller has accepted one or more AI-generated suggestions.
 * Acceptance is explicit — includes approval metadata for the audit record.
 */
export class AiSuggestionAccepted extends Subject implements CrmEvent {
  readonly visitName = "resolveAiSuggestionAccepted" as const;
  constructor(
    public readonly eventId: string,
    public readonly organizationId: string,
    public readonly occurredAt: string,
    public readonly suggestionId: string,
    public readonly opportunityId: string | undefined,
    public readonly approval: AiSuggestionApproval,
    public readonly aiModelId: string,
    public readonly promptTemplateId: string,
  ) {
    super();
  }
}

/**
 * A seller has rejected an AI-generated suggestion.
 * Rejection is stored for model feedback — no canonical state is changed.
 */
export class AiSuggestionRejected extends Subject implements CrmEvent {
  readonly visitName = "resolveAiSuggestionRejected" as const;
  constructor(
    public readonly eventId: string,
    public readonly organizationId: string,
    public readonly occurredAt: string,
    public readonly suggestionId: string,
    public readonly rejectedByUserId: string,
    public readonly reason: string | undefined,
  ) {
    super();
  }
}

/**
 * A seller has requested a deal brief (read-only risk + next-action summary).
 * AI output is advisory only — no canonical fields are written.
 */
export class AiDealBriefRequested extends Subject implements CrmEvent {
  readonly visitName = "resolveAiDealBriefRequested" as const;
  constructor(
    public readonly eventId: string,
    public readonly organizationId: string,
    public readonly occurredAt: string,
    public readonly requestedByUserId: string,
    public readonly opportunityId: string,
  ) {
    super();
  }
}

/**
 * An exec or manager has requested a pipeline summary narrative.
 * Narrative must be derived from the audit log and canonical state only.
 */
export class AiPipelineSummaryRequested extends Subject implements CrmEvent {
  readonly visitName = "resolveAiPipelineSummaryRequested" as const;
  constructor(
    public readonly eventId: string,
    public readonly organizationId: string,
    public readonly occurredAt: string,
    public readonly requestedByUserId: string,
    public readonly periodStart: string,
    public readonly periodEnd: string,
  ) {
    super();
  }
}

/**
 * A data-hygiene scan has been requested (duplicate detection, stale data, etc.).
 * AI output is suggestions only — cleanup requires explicit user approval.
 */
export class AiHygieneScanRequested extends Subject implements CrmEvent {
  readonly visitName = "resolveAiHygieneScanRequested" as const;
  constructor(
    public readonly eventId: string,
    public readonly organizationId: string,
    public readonly occurredAt: string,
    public readonly requestedByUserId: string,
    public readonly scope: "contacts" | "accounts" | "opportunities" | "all",
  ) {
    super();
  }
}
