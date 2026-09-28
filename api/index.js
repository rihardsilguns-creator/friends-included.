import { dashboard, RuleError } from "../lib/business.mjs";
import { approveExpense, approveSale, createExpense, createSale, deliverDecision, retrySync } from "../lib/process.mjs";
import { getEmployee, getEmployeeByTelegramUserId, getEmployees, linkTelegram, list, storageMode } from "../lib/store.mjs";
import { sendTelegram } from "../lib/telegram.mjs";

function send(res, status, data) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(JSON.stringify(data));
}

async function body(req) {
  if (req.body && typeof req.body === "object") return req.body;
  let raw = "";
  for await (const chunk of req) raw += chunk;
  return raw ? JSON.parse(raw) : {};
}

function pathOf(req) {
  return new URL(req.url, "http://local").pathname.replace(/^\/api/, "") || "/";
}

async function telegramWebhook(payload) {
  const message = payload.message;
  if (!message?.text) return { ok: true };
  const chatId = message.chat.id;
  const userId = message.from.id;
  const text = message.text.trim();
  if (text.startsWith("/start")) {
    await sendTelegram(chatId, `Welcome to Friends Included. Your Telegram user ID is ${userId}. Ask Svetlana to link it in Manager setup. Use /help for commands.`);
    return { ok: true };
  }
  if (text.startsWith("/help")) {
    await sendTelegram(chatId, "Sale: /sale REF|Customer|A or B|Description|Amount|Richard%|Anastasia%|Jean-Claude%\nExpense: /expense REF|Description|Materials/Travel/Other|Amount|A/B/Company overhead");
    return { ok: true };
  }
  const employee = await getEmployeeByTelegramUserId(userId);
  if (!employee) {
    await sendTelegram(chatId, `Your Telegram user ID ${userId} is not linked. Ask Svetlana to link it in Manager setup.`);
    return { ok: true };
  }
  try {
    if (text.startsWith("/sale ")) {
      const [reference, customer, project, description, amount, richard, anastasia, jeanClaude] = text.slice(6).split("|").map(x => x.trim());
      const sale = await createSale(employee.id, { reference, customer, project, description, amount, split: { richard, anastasia, "jean-claude": jeanClaude } }, chatId);
      await sendTelegram(chatId, `Recorded ${sale.reference}: €${(sale.amount_cents / 100).toFixed(2)}, project ${sale.project}, ${sale.status}. Sheets: ${sale.sync_status}.`);
    } else if (text.startsWith("/expense ")) {
      const [reference, description, category, amount, proposedAllocation] = text.slice(9).split("|").map(x => x.trim());
      const expense = await createExpense(employee.id, { reference, description, category, amount, proposedAllocation }, chatId);
      await sendTelegram(chatId, `Recorded ${expense.reference}: €${(expense.amount_cents / 100).toFixed(2)}, proposed ${expense.proposed_allocation}, ${expense.status}. Sheets: ${expense.sync_status}.`);
    } else {
      await sendTelegram(chatId, "Command not recognized. Use /help for the required format.");
    }
  } catch (error) {
    await sendTelegram(chatId, `Not recorded: ${error.message}`);
  }
  return { ok: true };
}

export default async function handler(req, res) {
  try {
    const path = pathOf(req);
    if (req.method === "POST" && path === "/telegram/webhook") return send(res, 200, await telegramWebhook(await body(req)));
    const actorId = String(req.headers["x-demo-employee-id"] || "");
    const actor = await getEmployee(actorId);
    if (!actor) throw new RuleError("Choose a demonstration role.", 401);

    if (req.method === "GET" && path === "/state") {
      const [employees, allSales, allExpenses] = await Promise.all([getEmployees(), list("sales"), list("expenses")]);
      const isManager = actor.role === "manager";
      const sales = isManager ? allSales : allSales.filter(s => s.salesperson_id === actor.id);
      const expenses = isManager ? allExpenses : allExpenses.filter(e => e.reporter_id === actor.id);
      return send(res, 200, {
        studentName: process.env.STUDENT_NAME || "Student",
        actor,
        employees: employees.map(e => ({ id: e.id, name: e.name, role: e.role, telegram_user_id: isManager ? e.telegram_user_id : undefined, telegram_chat_id: isManager ? e.telegram_chat_id : undefined })),
        sales,
        expenses,
        dashboard: isManager ? dashboard(allSales, allExpenses) : null,
        storageMode: storageMode(),
        links: {
          telegram: process.env.TELEGRAM_BOT_URL || null,
          sheets: process.env.SHEETS_VIEW_URL || null,
          github: process.env.GITHUB_REPOSITORY_URL || null
        }
      });
    }
    if (req.method === "POST" && path === "/sales") return send(res, 201, await createSale(actorId, await body(req)));
    if (req.method === "POST" && path === "/expenses") return send(res, 201, await createExpense(actorId, await body(req)));

    let match = path.match(/^\/sales\/([^/]+)\/approve$/);
    if (req.method === "POST" && match) return send(res, 200, await approveSale(actorId, decodeURIComponent(match[1]), (await body(req)).split));
    match = path.match(/^\/expenses\/([^/]+)\/approve$/);
    if (req.method === "POST" && match) return send(res, 200, await approveExpense(actorId, decodeURIComponent(match[1]), (await body(req)).allocation));
    match = path.match(/^\/sync\/(sales|expenses)\/([^/]+)\/retry$/);
    if (req.method === "POST" && match) return send(res, 200, await retrySync(actorId, match[1], decodeURIComponent(match[2])));
    match = path.match(/^\/notify\/(sales|expenses)\/([^/]+)\/retry$/);
    if (req.method === "POST" && match) {
      if (actor.role !== "manager") throw new RuleError("Only Svetlana can retry notifications.", 403);
      const records = await list(match[1]);
      const record = records.find(r => r.reference === decodeURIComponent(match[2]));
      if (!record) throw new RuleError("Transaction not found.", 404);
      return send(res, 200, await deliverDecision(match[1], record));
    }
    if (req.method === "POST" && path === "/telegram-links") {
      if (actor.role !== "manager") throw new RuleError("Only Svetlana can link Telegram accounts.", 403);
      const payload = await body(req);
      return send(res, 200, await linkTelegram(payload.employeeId, payload.userId, payload.chatId));
    }
    throw new RuleError("Route not found.", 404);
  } catch (error) {
    console.error(error);
    send(res, error.status || 500, { error: error.status ? error.message : "The request could not be completed.", detail: process.env.NODE_ENV === "development" ? error.message : undefined });
  }
}
