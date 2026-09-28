export async function sendTelegram(chatId, text) {
  if (!chatId) throw new Error("No Telegram recipient linked.");
  if (!process.env.TELEGRAM_BOT_TOKEN) throw new Error("Telegram bot token is not configured.");
  const response = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text })
  });
  const result = await response.json();
  if (!response.ok || !result.ok) throw new Error(result.description || "Telegram delivery failed.");
  return result;
}

export function saleDecisionMessage(sale) {
  const changed = ["richard", "anastasia", "jean_claude"].some(id => sale[`proposed_${id}_pct`] !== sale[`approved_${id}_pct`]);
  return [
    `Sale ${sale.reference} approved${changed ? " — commission split changed" : ""}.`,
    `Sale €${(sale.amount_cents / 100).toFixed(2)}; total commission €${(sale.commission_pool_cents / 100).toFixed(2)}.`,
    `Richard: ${sale.proposed_richard_pct}% → ${sale.approved_richard_pct}% (€${(sale.commission_richard_cents / 100).toFixed(2)}).`,
    `Anastasia: ${sale.proposed_anastasia_pct}% → ${sale.approved_anastasia_pct}% (€${(sale.commission_anastasia_cents / 100).toFixed(2)}).`,
    `Jean-Claude: ${sale.proposed_jean_claude_pct}% → ${sale.approved_jean_claude_pct}% (€${(sale.commission_jean_claude_cents / 100).toFixed(2)}).`
  ].join("\n");
}

export function expenseDecisionMessage(expense) {
  const changed = expense.proposed_allocation !== expense.final_allocation;
  return [`Expense ${expense.reference}${changed ? " — allocation changed" : ""}.`, `€${(expense.amount_cents / 100).toFixed(2)}: ${expense.description}`, `Proposed: ${expense.proposed_allocation}.`, `Approved: ${expense.final_allocation}.`].join("\n");
}
