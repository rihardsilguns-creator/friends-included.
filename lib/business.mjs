export const PEOPLE = [
  { id: "svetlana", name: "Svetlana de Monte Carlo", role: "manager" },
  { id: "richard", name: "Richard Darling", role: "sales" },
  { id: "anastasia", name: "Anastasia Ferrari", role: "sales" },
  { id: "jean-claude", name: "Jean-Claude Bērziņš", role: "sales" },
  { id: "kevin", name: "Kevin von Whatever", role: "expense" }
];

export const SALES_IDS = ["richard", "anastasia", "jean-claude"];
export const PROJECTS = ["A", "B"];
export const ALLOCATIONS = ["A", "B", "Company overhead"];
export const EXPENSE_CATEGORIES = ["Materials", "Travel", "Other"];

export class RuleError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = "RuleError";
    this.status = status;
  }
}

export function eurosToCents(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) throw new RuleError("Amount must be greater than zero.");
  return Math.round((number + Number.EPSILON) * 100);
}

export function centsToEuros(cents) {
  return Number((Number(cents || 0) / 100).toFixed(2));
}

export function requireText(value, label) {
  const text = String(value || "").trim();
  if (!text) throw new RuleError(`${label} is required.`);
  return text;
}

export function validateReference(value) {
  const ref = requireText(value, "Reference").toUpperCase();
  if (!/^[SE][A-Z0-9-]{1,19}$/.test(ref)) throw new RuleError("Reference must start with S or E and use letters, numbers, or hyphens.");
  return ref;
}

export function normalizeSplit(input) {
  const split = {
    richard: Number(input?.richard),
    anastasia: Number(input?.anastasia),
    "jean-claude": Number(input?.["jean-claude"])
  };
  for (const id of SALES_IDS) {
    if (!Number.isFinite(split[id]) || split[id] < 0 || split[id] > 100) {
      throw new RuleError("Each commission share must be between 0% and 100%.");
    }
  }
  const total = SALES_IDS.reduce((sum, id) => sum + split[id], 0);
  if (Math.abs(total - 100) > 0.0001) throw new RuleError("Commission shares must total exactly 100%.");
  return split;
}

export function commissionFor(amountCents, splitInput) {
  const split = normalizeSplit(splitInput);
  const poolCents = Math.round(Number(amountCents) * 0.1);
  const amounts = Object.fromEntries(SALES_IDS.map(id => [id, Math.round(poolCents * split[id] / 100)]));
  const difference = poolCents - SALES_IDS.reduce((sum, id) => sum + amounts[id], 0);
  const winner = [...SALES_IDS].sort((a, b) => split[b] - split[a] || SALES_IDS.indexOf(a) - SALES_IDS.indexOf(b))[0];
  amounts[winner] += difference;
  return { poolCents, split, amounts };
}

export function assertAction(employee, action) {
  if (!employee) throw new RuleError("Select a valid demonstration role.", 401);
  const allowed = {
    submitSale: employee.role === "sales",
    submitExpense: employee.role === "expense",
    manage: employee.role === "manager"
  }[action];
  if (!allowed) throw new RuleError("This role is not allowed to perform that action.", 403);
}

export function dashboard(sales = [], expenses = []) {
  const approved = sales.filter(s => s.status === "Approved");
  const project = {
    A: { incomeCents: 0, commissionCents: 0, expenseCents: 0, resultCents: 0 },
    B: { incomeCents: 0, commissionCents: 0, expenseCents: 0, resultCents: 0 }
  };
  const earned = Object.fromEntries(SALES_IDS.map(id => [id, 0]));
  for (const sale of approved) {
    project[sale.project].incomeCents += sale.amount_cents;
    project[sale.project].commissionCents += sale.commission_pool_cents;
    for (const id of SALES_IDS) earned[id] += sale[`commission_${id.replace("-", "_")}_cents`] || 0;
  }
  let overheadCents = 0;
  let awaitingCents = 0;
  for (const expense of expenses) {
    if (expense.final_allocation === "A" || expense.final_allocation === "B") project[expense.final_allocation].expenseCents += expense.amount_cents;
    else if (expense.final_allocation === "Company overhead") overheadCents += expense.amount_cents;
    else awaitingCents += expense.amount_cents;
  }
  for (const id of PROJECTS) {
    project[id].resultCents = project[id].incomeCents - project[id].commissionCents - project[id].expenseCents;
  }
  const companyIncomeCents = approved.reduce((sum, s) => sum + s.amount_cents, 0);
  const companyCommissionCents = approved.reduce((sum, s) => sum + s.commission_pool_cents, 0);
  const companyExpensesCents = expenses.reduce((sum, e) => sum + e.amount_cents, 0);
  return {
    project,
    company: {
      incomeCents: companyIncomeCents,
      commissionCents: companyCommissionCents,
      expenseCents: companyExpensesCents,
      overheadCents,
      awaitingCents,
      resultCents: companyIncomeCents - companyCommissionCents - companyExpensesCents
    },
    earned,
    pendingSales: sales.filter(s => s.status === "Pending approval").length,
    awaitingExpenses: expenses.filter(e => e.status === "Awaiting allocation").length
  };
}
