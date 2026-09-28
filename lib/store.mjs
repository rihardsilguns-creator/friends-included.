import { PEOPLE, RuleError } from "./business.mjs";

const memory = globalThis.__friendsIncludedMemory ||= {
  employees: PEOPLE.map(p => ({ ...p, telegram_user_id: null, telegram_chat_id: null })),
  sales: [],
  expenses: []
};

function useMemory() {
  return process.env.DATA_MODE === "memory" || !process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY;
}

async function supabase(table, { method = "GET", query = "", body, prefer } = {}) {
  const response = await fetch(`${process.env.SUPABASE_URL}/rest/v1/${table}${query ? `?${query}` : ""}`, {
    method,
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      "content-type": "application/json",
      prefer: prefer || (method === "POST" ? "return=representation" : "return=representation")
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  if (!response.ok) {
    const detail = await response.text();
    if (response.status === 409 || detail.includes("duplicate key")) throw new RuleError("That reference already exists.", 409);
    throw new Error(`Database request failed (${response.status}): ${detail}`);
  }
  const text = await response.text();
  return text ? JSON.parse(text) : [];
}

export async function ensureEmployees() {
  if (useMemory()) return memory.employees;
  const current = await supabase("employees", { query: "select=*" });
  if (current.length) return current;
  return supabase("employees", { method: "POST", body: PEOPLE });
}

export async function list(table) {
  if (useMemory()) return structuredClone(memory[table]);
  return supabase(table, { query: "select=*&order=submitted_at.asc" });
}

export async function getByReference(table, reference) {
  if (useMemory()) return memory[table].find(r => r.reference === reference) || null;
  const rows = await supabase(table, { query: `select=*&reference=eq.${encodeURIComponent(reference)}` });
  return rows[0] || null;
}

export async function insert(table, record) {
  if (useMemory()) {
    if (memory[table].some(r => r.reference === record.reference)) throw new RuleError("That reference already exists.", 409);
    memory[table].push(structuredClone(record));
    return structuredClone(record);
  }
  const rows = await supabase(table, { method: "POST", body: record });
  return rows[0];
}

export async function patchByReference(table, reference, changes) {
  if (useMemory()) {
    const index = memory[table].findIndex(r => r.reference === reference);
    if (index < 0) throw new RuleError("Transaction not found.", 404);
    memory[table][index] = { ...memory[table][index], ...structuredClone(changes) };
    return structuredClone(memory[table][index]);
  }
  const rows = await supabase(table, { method: "PATCH", query: `reference=eq.${encodeURIComponent(reference)}`, body: changes });
  if (!rows[0]) throw new RuleError("Transaction not found.", 404);
  return rows[0];
}

export async function getEmployees() {
  return ensureEmployees();
}

export async function getEmployee(id) {
  const employees = await ensureEmployees();
  return employees.find(e => e.id === id) || null;
}

export async function getEmployeeByTelegramUserId(userId) {
  const employees = await ensureEmployees();
  return employees.find(e => String(e.telegram_user_id || "") === String(userId)) || null;
}

export async function linkTelegram(employeeId, userId, chatId) {
  if (useMemory()) {
    for (const employee of memory.employees) {
      if (String(employee.telegram_user_id || "") === String(userId) && employee.id !== employeeId) {
        employee.telegram_user_id = null;
        employee.telegram_chat_id = null;
      }
    }
    const employee = memory.employees.find(e => e.id === employeeId);
    if (!employee) throw new RuleError("Employee not found.", 404);
    Object.assign(employee, { telegram_user_id: String(userId), telegram_chat_id: String(chatId || userId) });
    return structuredClone(employee);
  }
  await supabase("employees", { method: "PATCH", query: `telegram_user_id=eq.${encodeURIComponent(userId)}&id=neq.${encodeURIComponent(employeeId)}`, body: { telegram_user_id: null, telegram_chat_id: null } });
  const rows = await supabase("employees", { method: "PATCH", query: `id=eq.${encodeURIComponent(employeeId)}`, body: { telegram_user_id: String(userId), telegram_chat_id: String(chatId || userId) } });
  if (!rows[0]) throw new RuleError("Employee not found.", 404);
  return rows[0];
}

export function storageMode() {
  return useMemory() ? "memory" : "supabase";
}
