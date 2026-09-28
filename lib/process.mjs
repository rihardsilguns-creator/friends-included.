import { ALLOCATIONS, EXPENSE_CATEGORIES, PROJECTS, RuleError, assertAction, commissionFor, eurosToCents, normalizeSplit, requireText, validateReference } from "./business.mjs";
import { getByReference, getEmployee, insert, patchByReference } from "./store.mjs";
import { syncRecord } from "./google-sheets.mjs";
import { expenseDecisionMessage, saleDecisionMessage, sendTelegram } from "./telegram.mjs";

async function syncAfterSave(table, record) {
  try {
    await syncRecord(table, record);
    return patchByReference(table, record.reference, { sync_status: "Synced", sync_error: null });
  } catch (error) {
    return patchByReference(table, record.reference, { sync_status: "Sync failed", sync_error: error.message });
  }
}

export async function createSale(actorId, body, originChatId = null) {
  const actor = await getEmployee(actorId);
  assertAction(actor, "submitSale");
  const reference = validateReference(body.reference);
  if (!reference.startsWith("S")) throw new RuleError("A sale reference must start with S.");
  const split = normalizeSplit(body.split);
  const record = {
    reference,
    submitted_at: new Date().toISOString(),
    salesperson_id: actor.id,
    salesperson_name: actor.name,
    customer: requireText(body.customer, "Customer"),
    project: PROJECTS.includes(body.project) ? body.project : (() => { throw new RuleError("Project must be A or B."); })(),
    description: requireText(body.description, "Description"),
    amount_cents: eurosToCents(body.amount),
    proposed_richard_pct: split.richard,
    proposed_anastasia_pct: split.anastasia,
    proposed_jean_claude_pct: split["jean-claude"],
    approved_richard_pct: null,
    approved_anastasia_pct: null,
    approved_jean_claude_pct: null,
    commission_pool_cents: 0,
    commission_richard_cents: 0,
    commission_anastasia_cents: 0,
    commission_jean_claude_cents: 0,
    status: "Pending approval",
    original_chat_id: originChatId ? String(originChatId) : actor.telegram_chat_id,
    sync_status: "Sync pending",
    notification_status: actor.telegram_chat_id || originChatId ? "Not sent" : "No Telegram recipient linked"
  };
  await insert("sales", record);
  return syncAfterSave("sales", record);
}

export async function createExpense(actorId, body, originChatId = null) {
  const actor = await getEmployee(actorId);
  assertAction(actor, "submitExpense");
  const reference = validateReference(body.reference);
  if (!reference.startsWith("E")) throw new RuleError("An expense reference must start with E.");
  if (!EXPENSE_CATEGORIES.includes(body.category)) throw new RuleError("Choose Materials, Travel, or Other.");
  if (!ALLOCATIONS.includes(body.proposedAllocation)) throw new RuleError("Choose project A, project B, or Company overhead.");
  const overhead = body.proposedAllocation === "Company overhead";
  const record = {
    reference,
    submitted_at: new Date().toISOString(),
    reporter_id: actor.id,
    reporter_name: actor.name,
    description: requireText(body.description, "Description"),
    category: body.category,
    amount_cents: eurosToCents(body.amount),
    proposed_allocation: body.proposedAllocation,
    final_allocation: overhead ? "Company overhead" : null,
    status: overhead ? "Allocated" : "Awaiting allocation",
    original_chat_id: originChatId ? String(originChatId) : actor.telegram_chat_id,
    sync_status: "Sync pending",
    notification_status: overhead ? "Not required" : (actor.telegram_chat_id || originChatId ? "Not sent" : "No Telegram recipient linked")
  };
  await insert("expenses", record);
  return syncAfterSave("expenses", record);
}

export async function approveSale(actorId, reference, splitInput) {
  const actor = await getEmployee(actorId);
  assertAction(actor, "manage");
  const sale = await getByReference("sales", reference);
  if (!sale) throw new RuleError("Sale not found.", 404);
  if (sale.status === "Approved") return sale;
  const result = commissionFor(sale.amount_cents, splitInput);
  let updated = await patchByReference("sales", reference, {
    approved_richard_pct: result.split.richard,
    approved_anastasia_pct: result.split.anastasia,
    approved_jean_claude_pct: result.split["jean-claude"],
    commission_pool_cents: result.poolCents,
    commission_richard_cents: result.amounts.richard,
    commission_anastasia_cents: result.amounts.anastasia,
    commission_jean_claude_cents: result.amounts["jean-claude"],
    status: "Approved",
    approved_at: new Date().toISOString(),
    approved_by: actor.id
  });
  updated = await syncAfterSave("sales", updated);
  return deliverDecision("sales", updated);
}

export async function approveExpense(actorId, reference, allocation) {
  const actor = await getEmployee(actorId);
  assertAction(actor, "manage");
  if (!ALLOCATIONS.includes(allocation)) throw new RuleError("Choose project A, project B, or Company overhead.");
  const expense = await getByReference("expenses", reference);
  if (!expense) throw new RuleError("Expense not found.", 404);
  if (expense.status === "Allocated") return expense;
  let updated = await patchByReference("expenses", reference, { final_allocation: allocation, status: "Allocated", approved_at: new Date().toISOString(), approved_by: actor.id });
  updated = await syncAfterSave("expenses", updated);
  return deliverDecision("expenses", updated);
}

export async function retrySync(actorId, table, reference) {
  const actor = await getEmployee(actorId);
  if (!actor) throw new RuleError("Unknown role.", 401);
  const record = await getByReference(table, reference);
  if (!record) throw new RuleError("Transaction not found.", 404);
  if (actor.role !== "manager" && actor.id !== (record.salesperson_id || record.reporter_id)) throw new RuleError("You cannot retry this record.", 403);
  return syncAfterSave(table, record);
}

export async function deliverDecision(table, record) {
  if (!record.original_chat_id) return patchByReference(table, record.reference, { notification_status: "No Telegram recipient linked" });
  try {
    await sendTelegram(record.original_chat_id, table === "sales" ? saleDecisionMessage(record) : expenseDecisionMessage(record));
    return patchByReference(table, record.reference, { notification_status: "Sent", notification_error: null });
  } catch (error) {
    return patchByReference(table, record.reference, { notification_status: "Failed", notification_error: error.message });
  }
}
