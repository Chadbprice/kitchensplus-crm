/**
 * Communication Action Types — Single Source of Truth
 *
 * These are the approval queue action types that represent sendable communications.
 * Both the backend (sendCommunication procedure) and frontend (AgentApprovals UI)
 * must reference this list to stay in sync.
 *
 * When adding a new communication draft type:
 * 1. Add the action type string here
 * 2. Add the draft generation logic in NextActionExecutor.ts or a dedicated agent
 * 3. The sendCommunication procedure and AgentApprovals UI will automatically pick it up
 */
export const COMM_ACTION_TYPES = [
  "weekly_client_update",
  "milestone_complete_client_message",
  "milestone_delayed_client_message",
  "payment_reminder_client",
  "client_decision_request",
  "change_order_followup",
  "compliance_doc_request",
  "subcontractor_eta_request",
  "po_delivery_followup",
] as const;

export type CommActionType = typeof COMM_ACTION_TYPES[number];

/**
 * Check if an action type is a sendable communication type.
 */
export function isCommActionType(actionType: string): actionType is CommActionType {
  return (COMM_ACTION_TYPES as readonly string[]).includes(actionType);
}
