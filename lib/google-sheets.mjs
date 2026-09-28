import crypto from "node:crypto";

function base64url(value) {
  return Buffer.from(value).toString("base64url");
}

async function accessToken() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!email || !privateKey) throw new Error("Google Sheets credentials are not configured.");
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64url(JSON.stringify({ iss: email, scope: "https://www.googleapis.com/auth/spreadsheets", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 }));
  const unsigned = `${header}.${payload}`;
  const signature = crypto.sign("RSA-SHA256", Buffer.from(unsigned), privateKey).toString("base64url");
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${unsigned}.${signature}` })
  });
  if (!response.ok) throw new Error(`Google authorization failed: ${await response.text()}`);
  return (await response.json()).access_token;
}

const salesHeader = ["Reference", "Submission time", "Salesperson", "Customer", "Project", "Description", "Amount EUR", "Proposed Richard %", "Proposed Anastasia %", "Proposed Jean-Claude %", "Approved Richard %", "Approved Anastasia %", "Approved Jean-Claude %", "Richard commission EUR", "Anastasia commission EUR", "Jean-Claude commission EUR", "Status"];
const expensesHeader = ["Reference", "Submission time", "Reporter", "Description", "Category", "Amount EUR", "Proposed allocation", "Final allocation", "Status"];

function rowFor(table, r) {
  if (table === "sales") return [r.reference, r.submitted_at, r.salesperson_name, r.customer, r.project, r.description, r.amount_cents / 100, r.proposed_richard_pct, r.proposed_anastasia_pct, r.proposed_jean_claude_pct, r.approved_richard_pct ?? "", r.approved_anastasia_pct ?? "", r.approved_jean_claude_pct ?? "", (r.commission_richard_cents || 0) / 100, (r.commission_anastasia_cents || 0) / 100, (r.commission_jean_claude_cents || 0) / 100, r.status];
  return [r.reference, r.submitted_at, r.reporter_name, r.description, r.category, r.amount_cents / 100, r.proposed_allocation, r.final_allocation || "", r.status];
}

async function sheetsFetch(path, options = {}) {
  const token = await accessToken();
  const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${process.env.GOOGLE_SHEETS_SPREADSHEET_ID}${path}`, {
    ...options,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json", ...(options.headers || {}) }
  });
  if (!response.ok) throw new Error(`Google Sheets update failed: ${await response.text()}`);
  return response.json();
}

export async function syncRecord(table, record) {
  if (!process.env.GOOGLE_SHEETS_SPREADSHEET_ID) throw new Error("Google Sheets is not configured.");
  const tab = table === "sales" ? "Sales" : "Expenses";
  const header = table === "sales" ? salesHeader : expensesHeader;
  const column = table === "sales" ? "Q" : "I";
  const existing = await sheetsFetch(`/values/${encodeURIComponent(`${tab}!A:A`)}`);
  const values = existing.values || [];
  let rowNumber = values.findIndex(row => row[0] === record.reference) + 1;
  if (!values.length) {
    await sheetsFetch(`/values/${encodeURIComponent(`${tab}!A1:${column}1`)}?valueInputOption=RAW`, { method: "PUT", body: JSON.stringify({ values: [header] }) });
    rowNumber = 2;
  } else if (!rowNumber) rowNumber = values.length + 1;
  await sheetsFetch(`/values/${encodeURIComponent(`${tab}!A${rowNumber}:${column}${rowNumber}`)}?valueInputOption=USER_ENTERED`, { method: "PUT", body: JSON.stringify({ values: [rowFor(table, record)] }) });
  return { rowNumber };
}
