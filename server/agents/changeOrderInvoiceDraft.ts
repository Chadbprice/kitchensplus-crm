/**
 * changeOrderInvoiceDraft.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * When a change order is approved, auto-create a draft invoice for the CO amount
 * and route it through the approval queue so the owner can review before sending.
 *
 * Dedup: skip if a change_order invoice already exists for the same project+CO.
 */
import { getDb } from "../db";
import { invoices, changeOrders } from "../../drizzle/schema";
import { eq, and } from "drizzle-orm";
import { createApprovalItem, pendingApprovalExists } from "./approvalQueue";
import { sql } from "drizzle-orm";

const AGENT_NAME = "ChangeOrderInvoiceDraft";

export async function draftInvoiceForChangeOrder(
  changeOrderId: number
): Promise<{ drafted: boolean; reason?: string }> {
  try {
    const db = await getDb();
    if (!db) return { drafted: false, reason: "no_db" };

    // Fetch the approved change order
    const [co] = await db
      .select()
      .from(changeOrders)
      .where(eq(changeOrders.id, changeOrderId))
      .limit(1);

    if (!co) return { drafted: false, reason: "co_not_found" };
    if (co.status !== "approved") return { drafted: false, reason: "co_not_approved" };
    if (!co.projectId) return { drafted: false, reason: "no_project_id" };
    if (!co.amount || parseFloat(String(co.amount)) <= 0) return { drafted: false, reason: "no_amount" };

    // Dedup: check if a change_order invoice already exists for this project
    // (We check by matching projectId + invoiceType + amount as a proxy for the CO)
    const existingInvoice = await db
      .select({ id: invoices.id })
      .from(invoices)
      .where(
        and(
          eq(invoices.projectId, co.projectId),
          eq(invoices.invoiceType, "change_order"),
          eq(invoices.amount, co.amount as any)
        )
      )
      .limit(1);

    if (existingInvoice.length > 0) {
      return { drafted: false, reason: "invoice_already_exists" };
    }

    // Dedup: check approval queue
    const actionType = `financial.co_invoice_draft.${changeOrderId}`;
    const alreadyPending = await pendingApprovalExists("project", co.projectId, actionType);
    if (alreadyPending) {
      return { drafted: false, reason: "already_pending_approval" };
    }

    // Create a draft invoice
    const invoiceNumber = `INV-CO-${Date.now().toString().slice(-6)}`;
    await db.insert(invoices).values({
      projectId: co.projectId,
      leadId: (co as any).leadId ?? null,
      invoiceNumber,
      invoiceType: "change_order",
      amount: co.amount as any,
      status: "draft",
      dueDate: new Date(),
      notes: `Auto-generated for approved change order: ${co.title ?? ""} (${co.changeOrderNumber ?? `CO-${changeOrderId}`}). Amount: $${parseFloat(String(co.amount)).toLocaleString("en-US", { minimumFractionDigits: 2 })}`,
    });

    // Create approval queue item so owner can review before sending
    await createApprovalItem({
      agentName: AGENT_NAME,
      actionType,
      entityType: "project",
      entityId: co.projectId,
      title: `Invoice Draft: Change Order ${co.changeOrderNumber ?? `#${changeOrderId}`} — $${parseFloat(String(co.amount)).toLocaleString("en-US", { minimumFractionDigits: 2 })}`,
      description: `A draft invoice has been auto-created for the approved change order "${co.title ?? "Untitled"}". Review and send the invoice from the Invoices page, or dismiss if billing is handled separately.`,
      severity: "info",
      payload: {
        changeOrderId,
        changeOrderNumber: co.changeOrderNumber,
        amount: parseFloat(String(co.amount)),
        invoiceNumber,
        projectId: co.projectId,
      },
    });

    console.log(
      `[${AGENT_NAME}] Drafted invoice ${invoiceNumber} for CO ${co.changeOrderNumber ?? changeOrderId} ($${co.amount})`
    );

    return { drafted: true };
  } catch (err: any) {
    console.error(`[${AGENT_NAME}] Error drafting invoice for CO ${changeOrderId}:`, err?.message);
    return { drafted: false, reason: err?.message };
  }
}
