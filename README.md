# Friends Included Finance

A deployable Vercel application for the Wedding Guests for Hire assignment. It uses one shared rule layer for website and Telegram submissions, Supabase as the source of truth, an automatically synchronized Google Sheets copy, manager decisions, Telegram notifications, and the complete finance dashboard.

## What is included

- Demonstration role selector for Svetlana, Richard, Anastasia, Jean-Claude, and Kevin
- Server-side permission enforcement
- Sales and expense entry with duplicate, amount, required-field, allocation, and commission validation
- Idempotent manager decisions with preserved proposals and final values
- Exact cent-based commission calculations and rounding rule
- Project and company results, pending queues, overhead, awaiting allocation, and earned commission
- Telegram account linking, bot submissions, confirmations, decision notifications, and retry status
- Google Sheets upsert by transaction reference, plus visible failure and retry state
- Supabase schema and automated checks for both supplied test scenarios

## Local demonstration

Use Node.js 20 or newer.

```text
npm run dev
```

The local server starts in memory mode at `http://localhost:3000`. This is useful for checking the interface and rules; it is intentionally not persistent.

## Supabase setup

1. Create a Supabase project and run `supabase/schema.sql` in its SQL editor.
2. Copy `.env.example` to `.env` for local work.
3. Set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.
4. Keep the service-role key server-side. Never put it in browser code or GitHub.

The API uses the service role only from Vercel server functions. Row-level security remains enabled for direct public access.

## Google Sheets setup

1. Create a Google Cloud project, enable the Google Sheets API, create a service account, and obtain its credentials.
2. Create a spreadsheet with tabs named `Sales` and `Expenses`.
3. Share the spreadsheet with the service account email as Editor.
4. Set `GOOGLE_SHEETS_SPREADSHEET_ID`, `GOOGLE_SERVICE_ACCOUNT_EMAIL`, and `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` in Vercel.
5. Give the instructor Viewer access. Do not grant public editing.

The application writes headers when a tab is empty and updates an existing row by reference on approval or retry.

## Telegram setup

1. Create a bot with BotFather and set `TELEGRAM_BOT_TOKEN` in Vercel.
2. Deploy the application, then set the webhook:

```text
https://api.telegram.org/bot<YOUR_TOKEN>/setWebhook?url=https://<YOUR-VERCEL-DOMAIN>/api/telegram/webhook
```

3. Start the bot in a private chat. It replies with the Telegram user ID.
4. As Svetlana on the website, open Telegram setup and link that ID to a fictional employee.

Commands:

```text
/sale REF|Customer|A or B|Description|Amount|Richard%|Anastasia%|Jean-Claude%
/expense REF|Description|Materials/Travel/Other|Amount|A/B/Company overhead
```

Example:

```text
/sale S01|Olivia Rose|A|One proud uncle and an emotional grandmother|1000|50|30|20
/expense E01|Rented suit and fake pearl necklace for the relatives|Materials|120|A
```

## Vercel deployment

1. Put this folder in a private or instructor-accessible GitHub repository.
2. Import it into Vercel.
3. Add every variable from `.env.example`, set `DATA_MODE=supabase`, and set `STUDENT_NAME`.
4. Deploy and configure the Telegram webhook with the resulting URL.
5. Add the Vercel, Google Sheets, Telegram bot, and GitHub links where required by the course.

## Verification

Run:

```text
npm test
npm run check
```

The tests prove the required Test 1 totals (€700, €1,800, €2,400), cumulative Test 2 totals (€2,050, €2,180, €3,930), earned commissions (€140, €175, €215), split validation, and server-side permission checks.

Before submission, clear practice data, enter S01 and E01 through the actual bot, complete the remaining supplied entries through the website, confirm Sheets rows and Telegram callbacks, and leave S05 and E07 pending as instructed.
