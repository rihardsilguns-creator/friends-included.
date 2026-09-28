create table if not exists public.employees (
  id text primary key,
  name text not null,
  role text not null check (role in ('manager','sales','expense')),
  telegram_user_id text unique,
  telegram_chat_id text
);

create table if not exists public.sales (
  reference text primary key,
  submitted_at timestamptz not null,
  salesperson_id text not null references public.employees(id),
  salesperson_name text not null,
  customer text not null,
  project text not null check (project in ('A','B')),
  description text not null,
  amount_cents integer not null check (amount_cents > 0),
  proposed_richard_pct numeric not null,
  proposed_anastasia_pct numeric not null,
  proposed_jean_claude_pct numeric not null,
  approved_richard_pct numeric,
  approved_anastasia_pct numeric,
  approved_jean_claude_pct numeric,
  commission_pool_cents integer not null default 0,
  commission_richard_cents integer not null default 0,
  commission_anastasia_cents integer not null default 0,
  commission_jean_claude_cents integer not null default 0,
  status text not null check (status in ('Pending approval','Approved')),
  original_chat_id text,
  sync_status text not null,
  sync_error text,
  notification_status text not null,
  notification_error text,
  approved_at timestamptz,
  approved_by text references public.employees(id),
  check (proposed_richard_pct between 0 and 100 and proposed_anastasia_pct between 0 and 100 and proposed_jean_claude_pct between 0 and 100),
  check (proposed_richard_pct + proposed_anastasia_pct + proposed_jean_claude_pct = 100)
);

create table if not exists public.expenses (
  reference text primary key,
  submitted_at timestamptz not null,
  reporter_id text not null references public.employees(id),
  reporter_name text not null,
  description text not null,
  category text not null check (category in ('Materials','Travel','Other')),
  amount_cents integer not null check (amount_cents > 0),
  proposed_allocation text not null check (proposed_allocation in ('A','B','Company overhead')),
  final_allocation text check (final_allocation in ('A','B','Company overhead')),
  status text not null check (status in ('Awaiting allocation','Allocated')),
  original_chat_id text,
  sync_status text not null,
  sync_error text,
  notification_status text not null,
  notification_error text,
  approved_at timestamptz,
  approved_by text references public.employees(id)
);

alter table public.employees enable row level security;
alter table public.sales enable row level security;
alter table public.expenses enable row level security;

insert into public.employees (id,name,role) values
  ('svetlana','Svetlana de Monte Carlo','manager'),
  ('richard','Richard Darling','sales'),
  ('anastasia','Anastasia Ferrari','sales'),
  ('jean-claude','Jean-Claude Bērziņš','sales'),
  ('kevin','Kevin von Whatever','expense')
on conflict (id) do update set name=excluded.name, role=excluded.role;
