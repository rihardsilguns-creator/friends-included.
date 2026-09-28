const $ = selector => document.querySelector(selector);
const roleSelect = $("#roleSelect");
const state = { actor: null, employees: [], sales: [], expenses: [], dashboard: null };
const euro = cents => new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR" }).format((cents || 0) / 100);
const esc = value => String(value ?? "").replace(/[&<>'"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[c]));

function flash(text, error = false) {
  const el = $("#message"); el.textContent = text; el.hidden = false; el.classList.toggle("error", error); clearTimeout(flash.timer); flash.timer = setTimeout(() => el.hidden = true, 5000);
}
async function api(path, options = {}) {
  const response = await fetch(`/api${path}`, { ...options, headers: { "content-type": "application/json", "x-demo-employee-id": roleSelect.value, ...(options.headers || {}) } });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Request failed.");
  return data;
}
function status(text) { return `<span class="status ${String(text).toLowerCase().replaceAll(" ", "-")}">${esc(text)}</span>`; }

async function load() {
  try {
    const data = await api("/state"); Object.assign(state, data);
    $("#studentName").textContent = data.studentName;
    $("#welcome").textContent = `${data.actor.name} can ${data.actor.role === "manager" ? "review every record, make decisions and monitor the company" : data.actor.role === "sales" ? "submit sales and follow their approval status" : "submit expenses and follow their allocation status"}.`;
    $("#storageBadge").textContent = data.storageMode === "supabase" ? "Supabase connected" : "Local demonstration data";
    $("#integrationLinks").innerHTML = [["Telegram bot", data.links?.telegram], ["Google Sheets", data.links?.sheets], ["GitHub repository", data.links?.github]].map(([label, url]) => url ? `<a href="${esc(url)}" target="_blank" rel="noreferrer">${label}</a>` : `<span>${label} not configured</span>`).join("");
    render();
  } catch (error) { flash(error.message, true); }
}

function renderRoleOptions(employees) {
  const previous = localStorage.getItem("demoRole") || "svetlana";
  roleSelect.innerHTML = employees.map(e => `<option value="${esc(e.id)}">${esc(e.name)}</option>`).join("");
  roleSelect.value = employees.some(e => e.id === previous) ? previous : employees[0].id;
}

function render() {
  const manager = state.actor.role === "manager", salesRole = state.actor.role === "sales", expenseRole = state.actor.role === "expense";
  $("#dashboardSection").hidden = !manager; $("#managerSection").hidden = !manager; $("#entrySection").hidden = manager;
  $("#saleForm").hidden = !salesRole; $("#expenseForm").hidden = !expenseRole;
  $("#entryTitle").textContent = salesRole ? "Enter a sale" : "Enter an expense";
  if (manager) { renderDashboard(); renderLinks(); }
  renderSales(manager); renderExpenses(manager);
}

function renderDashboard() {
  const d = state.dashboard;
  $("#queueCounts").textContent = `${d.pendingSales} pending sale${d.pendingSales === 1 ? "" : "s"} · ${d.awaitingExpenses} allocation${d.awaitingExpenses === 1 ? "" : "s"}`;
  const card = (title, x, company = false) => `<article class="metric-card"><h3>${title}</h3><div class="metric-row"><span>Approved income</span><strong>${euro(x.incomeCents)}</strong></div><div class="metric-row"><span>Commission</span><strong>−${euro(x.commissionCents)}</strong></div><div class="metric-row"><span>${company ? "All recorded expenses" : "Allocated expenses"}</span><strong>−${euro(company ? x.expenseCents : x.expenseCents)}</strong></div>${company ? `<div class="metric-row"><span>Overhead</span><strong>${euro(x.overheadCents)}</strong></div><div class="metric-row"><span>Awaiting allocation</span><strong>${euro(x.awaitingCents)}</strong></div>` : ""}<div class="metric-row result"><span>Result</span><strong>${euro(x.resultCents)}</strong></div></article>`;
  $("#dashboard").innerHTML = card("Respectable Relatives", d.project.A) + card("Drunk University Friends", d.project.B) + card("Company", d.company, true);
  $("#commissions").innerHTML = [["Richard", d.earned.richard], ["Anastasia", d.earned.anastasia], ["Jean-Claude", d.earned["jean-claude"]]].map(([n,v]) => `<div class="commission-item"><span>${n}</span><strong>${euro(v)}</strong></div>`).join("");
}

function actions(table, r, manager) {
  const retrySync = r.sync_status !== "Synced" ? `<button class="button secondary small" data-action="sync" data-table="${table}" data-ref="${r.reference}">Retry sync</button>` : "";
  const retryNotify = manager && r.notification_status === "Failed" ? `<button class="button secondary small" data-action="notify" data-table="${table}" data-ref="${r.reference}">Retry notice</button>` : "";
  return retrySync + retryNotify;
}
function renderSales(manager) {
  const rows = state.sales.map(r => `<tr><td><strong>${esc(r.reference)}</strong><br><small>${new Date(r.submitted_at).toLocaleString()}</small></td><td>${esc(r.salesperson_name)}</td><td>${esc(r.customer)}<br><small>${esc(r.description)}</small></td><td>${esc(r.project)}</td><td>${euro(r.amount_cents)}</td><td>${r.proposed_richard_pct}/${r.proposed_anastasia_pct}/${r.proposed_jean_claude_pct}%${r.status === "Approved" ? `<br><strong>${r.approved_richard_pct}/${r.approved_anastasia_pct}/${r.approved_jean_claude_pct}%</strong>` : ""}</td><td>${status(r.status)}<br><small>${esc(r.sync_status)} · ${esc(r.notification_status)}</small></td><td><div class="record-actions">${manager && r.status !== "Approved" ? `<div class="approval-box"><input aria-label="Richard percent" value="${r.proposed_richard_pct}" data-split="richard"><input aria-label="Anastasia percent" value="${r.proposed_anastasia_pct}" data-split="anastasia"><input aria-label="Jean-Claude percent" value="${r.proposed_jean_claude_pct}" data-split="jean-claude"><button class="button primary small" data-action="approve-sale" data-ref="${r.reference}">Approve</button></div>` : ""}${actions("sales", r, manager)}</div></td></tr>`).join("");
  $("#salesTable").innerHTML = `<table><thead><tr><th>Reference</th><th>Salesperson</th><th>Customer and description</th><th>Project</th><th>Amount</th><th>Proposed / final split</th><th>Status</th><th>Action</th></tr></thead><tbody>${rows || `<tr><td colspan="8">No sales to show.</td></tr>`}</tbody></table>`;
}
function renderExpenses(manager) {
  const rows = state.expenses.map(r => `<tr><td><strong>${esc(r.reference)}</strong><br><small>${new Date(r.submitted_at).toLocaleString()}</small></td><td>${esc(r.reporter_name)}</td><td>${esc(r.description)}</td><td>${esc(r.category)}</td><td>${euro(r.amount_cents)}</td><td>${esc(r.proposed_allocation)}${r.final_allocation ? `<br><strong>${esc(r.final_allocation)}</strong>` : ""}</td><td>${status(r.status)}<br><small>${esc(r.sync_status)} · ${esc(r.notification_status)}</small></td><td><div class="record-actions">${manager && r.status === "Awaiting allocation" ? `<div class="approval-box"><select aria-label="Final allocation"><option value="A">A</option><option value="B">B</option><option>Company overhead</option></select><button class="button primary small" data-action="approve-expense" data-ref="${r.reference}">Confirm</button></div>` : ""}${actions("expenses", r, manager)}</div></td></tr>`).join("");
  $("#expensesTable").innerHTML = `<table><thead><tr><th>Reference</th><th>Reporter</th><th>Description</th><th>Category</th><th>Amount</th><th>Proposed / final allocation</th><th>Status</th><th>Action</th></tr></thead><tbody>${rows || `<tr><td colspan="8">No expenses to show.</td></tr>`}</tbody></table>`;
}
function renderLinks() {
  $("#linkEmployee").innerHTML = state.employees.filter(e => e.id !== "svetlana").map(e => `<option value="${e.id}">${esc(e.name)}</option>`).join("");
  $("#linkList").innerHTML = state.employees.filter(e => e.id !== "svetlana").map(e => `<span class="link-chip"><strong>${esc(e.name)}</strong>: ${e.telegram_user_id ? `user ${esc(e.telegram_user_id)} · chat ${esc(e.telegram_chat_id)}` : "not linked"}</span>`).join("");
}

async function submitForm(event, kind) {
  event.preventDefault(); const formElement = event.currentTarget; const form = new FormData(formElement); const obj = Object.fromEntries(form);
  if (kind === "sales") obj.split = { richard: obj.richard, anastasia: obj.anastasia, "jean-claude": obj.jeanClaude };
  try { const result = await api(`/${kind}`, { method: "POST", body: JSON.stringify(obj) }); flash(`${result.reference} saved. ${result.sync_status}.`); formElement.reset(); await load(); } catch (error) { flash(error.message, true); }
}
$("#saleForm").addEventListener("submit", e => submitForm(e, "sales"));
$("#expenseForm").addEventListener("submit", e => submitForm(e, "expenses"));
$("#linkForm").addEventListener("submit", async e => { e.preventDefault(); const formElement = e.currentTarget; const obj = Object.fromEntries(new FormData(formElement)); if (!obj.chatId) obj.chatId = obj.userId; try { await api("/telegram-links", { method: "POST", body: JSON.stringify(obj) }); flash("Telegram link saved."); formElement.reset(); await load(); } catch (error) { flash(error.message, true); } });
document.addEventListener("click", async e => {
  const button = e.target.closest("[data-action]"); if (!button) return;
  try {
    if (button.dataset.action === "approve-sale") { const box = button.closest(".approval-box"); const split = Object.fromEntries([...box.querySelectorAll("[data-split]")].map(i => [i.dataset.split, i.value])); await api(`/sales/${button.dataset.ref}/approve`, { method: "POST", body: JSON.stringify({ split }) }); flash(`${button.dataset.ref} approved.`); }
    if (button.dataset.action === "approve-expense") { const allocation = button.closest(".approval-box").querySelector("select").value; await api(`/expenses/${button.dataset.ref}/approve`, { method: "POST", body: JSON.stringify({ allocation }) }); flash(`${button.dataset.ref} allocated.`); }
    if (button.dataset.action === "sync") { await api(`/sync/${button.dataset.table}/${button.dataset.ref}/retry`, { method: "POST" }); flash("Synchronization retried."); }
    if (button.dataset.action === "notify") { await api(`/notify/${button.dataset.table}/${button.dataset.ref}/retry`, { method: "POST" }); flash("Notification retried."); }
    await load();
  } catch (error) { flash(error.message, true); }
});
roleSelect.addEventListener("change", () => { localStorage.setItem("demoRole", roleSelect.value); load(); });
$("#refresh").addEventListener("click", load);

const employees = [
  { id: "svetlana", name: "Svetlana de Monte Carlo" }, { id: "richard", name: "Richard Darling" }, { id: "anastasia", name: "Anastasia Ferrari" }, { id: "jean-claude", name: "Jean-Claude Bērziņš" }, { id: "kevin", name: "Kevin von Whatever" }
];
renderRoleOptions(employees); load();
