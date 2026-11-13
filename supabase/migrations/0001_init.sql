-- Wedding planning dashboard: proposed Supabase schema, revision 2 (for review, not yet applied)
-- Money is stored in integer cents. Auth is Supabase magic links (auth.users); no passwords.
--
-- Changes from rev 1:
--   * Per-person "can see amounts": money now lives in its own tables with their own RLS,
--     so someone can see a vendor or deadline without seeing any dollar figures.
--   * payment_records ledger replaces obligations.paid_cents (supports partial payments).
--   * members.receive_all_reminders: copy chosen people (you) on every reminder.

create extension if not exists "pgcrypto";
create extension if not exists "citext";

-- ───────────────────────── Core ─────────────────────────

create table weddings (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  wedding_date  date,
  timezone      text not null default 'America/Chicago', -- reminders count "days out" in this zone
  created_by    uuid not null references auth.users(id),
  created_at    timestamptz not null default now()
);

create table members (
  id            uuid primary key default gen_random_uuid(),
  wedding_id    uuid not null references weddings(id) on delete cascade,
  user_id       uuid references auth.users(id),          -- null until they first sign in
  email         citext not null,
  display_name  text,
  role          text not null default 'viewer' check (role in ('owner','editor','viewer')),
  status        text not null default 'invited' check (status in ('invited','active','revoked')),
  -- what they can see:
  can_see_amounts   boolean not null default false,      -- any dollar figure
  can_see_deadlines boolean not null default true,       -- general deadlines not tied to a vendor
  vendor_scope  text not null default 'selected' check (vendor_scope in ('all','selected')),
  receive_all_reminders boolean not null default false,  -- copied on every reminder
  invited_by    uuid references auth.users(id),
  invited_at    timestamptz not null default now(),
  accepted_at   timestamptz,
  unique (wedding_id, email)
);

create table member_vendor_access (
  member_id  uuid not null references members(id) on delete cascade,
  vendor_id  uuid not null,  -- FK added after vendors
  primary key (member_id, vendor_id)
);

-- ───────────────────────── Vendors ─────────────────────────

create table vendors (
  id             uuid primary key default gen_random_uuid(),
  wedding_id     uuid not null references weddings(id) on delete cascade,
  name           text not null,
  category       text,                       -- venue, photographer, florist, ...
  contact_name   text,
  contact_email  text,
  contact_phone  text,
  status         text not null default 'considering'
                 check (status in ('considering','booked','completed','cancelled')),
  notes          text,
  created_at     timestamptz not null default now()
);

alter table member_vendor_access
  add constraint mva_vendor_fk foreign key (vendor_id) references vendors(id) on delete cascade;

-- Money for a vendor (hidden from members without can_see_amounts).
create table vendor_contracts (
  vendor_id             uuid primary key references vendors(id) on delete cascade,
  wedding_id            uuid not null references weddings(id) on delete cascade,
  contract_total_cents  bigint not null default 0 check (contract_total_cents >= 0),
  contract_signed_on    date
);

-- ───────────────────────── Deadlines & payments ─────────────────────────
-- One table for both. kind = 'payment' has a row in obligation_amounts; 'task' does not.

create table obligations (
  id                 uuid primary key default gen_random_uuid(),
  wedding_id         uuid not null references weddings(id) on delete cascade,
  vendor_id          uuid references vendors(id) on delete set null,  -- null = general deadline
  kind               text not null check (kind in ('payment','task')),
  title              text not null,                  -- "Florist deposit", "Final guest count"
  due_date           date not null,
  completed_at       timestamptz,                    -- tasks: set by hand; payments: set by trigger
  -- who owes it: a member, or someone outside the app (e.g. a parent) by email
  owed_by_member_id  uuid references members(id) on delete set null,
  owed_by_name       text,
  owed_by_email      citext,
  notes              text,
  created_at         timestamptz not null default now(),
  check (owed_by_member_id is not null or owed_by_email is not null)
);
create index obligations_due_idx on obligations (due_date) where completed_at is null;
create index obligations_vendor_idx on obligations (vendor_id);

create table obligation_amounts (
  obligation_id  uuid primary key references obligations(id) on delete cascade,
  wedding_id     uuid not null references weddings(id) on delete cascade,
  amount_cents   bigint not null check (amount_cents >= 0)
);

-- Ledger of money actually paid. Partial payments = several rows.
create table payment_records (
  id             uuid primary key default gen_random_uuid(),
  obligation_id  uuid not null references obligations(id) on delete cascade,
  wedding_id     uuid not null references weddings(id) on delete cascade,
  amount_cents   bigint not null check (amount_cents > 0),
  paid_on        date not null default current_date,
  method         text,                               -- check, card, transfer, cash
  note           text,
  recorded_by    uuid references auth.users(id),
  created_at     timestamptz not null default now()
);
create index payment_records_obl_idx on payment_records (obligation_id);

-- Mark a payment obligation complete once its ledger covers the amount (and reopen if not).
create function sync_obligation_completion() returns trigger
language plpgsql security definer set search_path = public as $$
declare obl_id uuid := coalesce(new.obligation_id, old.obligation_id);
begin
  update obligations o set completed_at =
    case when coalesce((select sum(amount_cents) from payment_records where obligation_id = obl_id), 0)
              >= coalesce((select amount_cents from obligation_amounts where obligation_id = obl_id), 1)
         then coalesce(o.completed_at, now()) else null end
  where o.id = obl_id and o.kind = 'payment';
  return null;
end $$;
create trigger payment_records_sync after insert or update or delete on payment_records
  for each row execute function sync_obligation_completion();

-- Vendor money summary. security_invoker: someone without amount access gets nulls, not numbers.
create view vendor_balances with (security_invoker = true) as
select v.id as vendor_id, v.wedding_id, v.name,
       c.contract_total_cents,
       coalesce(p.paid_cents, 0) as paid_cents,
       c.contract_total_cents - coalesce(p.paid_cents, 0) as remaining_cents
from vendors v
left join vendor_contracts c on c.vendor_id = v.id
left join (
  select o.vendor_id, sum(r.amount_cents) as paid_cents
  from payment_records r join obligations o on o.id = r.obligation_id
  group by o.vendor_id
) p on p.vendor_id = v.id;

-- ───────────────────────── Reminders ─────────────────────────
-- A daily Vercel cron job finds open obligations due in 7, 3 or 1 days (wedding timezone),
-- emails whoever owes it plus members with receive_all_reminders, and logs each send here.
-- The unique key makes re-runs safe and re-sends reminders if a due date is moved.

create table reminder_log (
  id             uuid primary key default gen_random_uuid(),
  obligation_id  uuid not null references obligations(id) on delete cascade,
  days_before    smallint not null check (days_before in (7,3,1)),
  due_date       date not null,            -- the due date at send time
  sent_to        citext not null,
  status         text not null default 'sent' check (status in ('sent','failed')),
  resend_id      text,
  error          text,
  sent_at        timestamptz not null default now(),
  unique (obligation_id, days_before, due_date, sent_to)
);

-- ───────────────────────── Access control (RLS) ─────────────────────────

alter table weddings             enable row level security;
alter table members              enable row level security;
alter table member_vendor_access enable row level security;
alter table vendors              enable row level security;
alter table vendor_contracts     enable row level security;
alter table obligations          enable row level security;
alter table obligation_amounts   enable row level security;
alter table payment_records      enable row level security;
alter table reminder_log         enable row level security;  -- no policies: service role only

create function my_member(w uuid) returns members
language sql stable security definer set search_path = public as $$
  select * from members
  where wedding_id = w and user_id = auth.uid() and status = 'active' limit 1
$$;

create function is_owner(w uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'owner' from my_member(w)), false)
$$;

create function is_editor(w uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role in ('owner','editor') from my_member(w)), false)
$$;

create function sees_amounts(w uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'owner' or can_see_amounts from my_member(w)), false)
$$;

create function can_see_vendor(w uuid, v uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from members m
    where m.wedding_id = w and m.user_id = auth.uid() and m.status = 'active'
      and (m.role = 'owner' or m.vendor_scope = 'all'
           or exists (select 1 from member_vendor_access a
                      where a.member_id = m.id and a.vendor_id = v))
  )
$$;

create function can_see_obligation(o obligations) returns boolean
language sql stable security definer set search_path = public as $$
  select is_owner(o.wedding_id)
      or (o.vendor_id is not null and can_see_vendor(o.wedding_id, o.vendor_id))
      or o.owed_by_member_id = (select id from my_member(o.wedding_id))
      or (o.vendor_id is null
          and coalesce((select can_see_deadlines from my_member(o.wedding_id)), false))
$$;

-- weddings / members
create policy weddings_read on weddings for select using ((my_member(id)).id is not null);
create policy members_self  on members for select using (user_id = auth.uid());
create policy members_owner on members for all
  using (is_owner(wedding_id)) with check (is_owner(wedding_id));
create policy mva_owner on member_vendor_access for all
  using (is_owner((select wedding_id from members where id = member_id)));

-- vendors: see allowed ones; editors/owners write
create policy vendors_read  on vendors for select using (can_see_vendor(wedding_id, id));
create policy vendors_write on vendors for all
  using (is_editor(wedding_id)) with check (is_editor(wedding_id));

-- vendor contract money: needs vendor access AND amount access
create policy contracts_read on vendor_contracts for select
  using (sees_amounts(wedding_id) and can_see_vendor(wedding_id, vendor_id));
create policy contracts_write on vendor_contracts for all
  using (is_editor(wedding_id)) with check (is_editor(wedding_id));

-- obligations
create policy obligations_read on obligations for select using (can_see_obligation(obligations));
create policy obligations_write on obligations for all
  using (is_editor(wedding_id)) with check (is_editor(wedding_id));

-- obligation amounts and payment ledger: need obligation access AND amount access
create policy amounts_read on obligation_amounts for select using (
  sees_amounts(wedding_id)
  and can_see_obligation((select o from obligations o where o.id = obligation_id)));
create policy amounts_write on obligation_amounts for all
  using (is_editor(wedding_id)) with check (is_editor(wedding_id));

create policy payments_read on payment_records for select using (
  sees_amounts(wedding_id)
  and can_see_obligation((select o from obligations o where o.id = obligation_id)));
create policy payments_write on payment_records for all
  using (is_editor(wedding_id)) with check (is_editor(wedding_id));

-- Invite flow (server-side, service role): an owner adds a members row (status 'invited');
-- a Next.js server action generates a magic link and emails it via Resend. When the link is
-- opened, /auth/confirm matches the email to the invited row and sets user_id,
-- status = 'active' and accepted_at. Emails not on the invite list never get a link.
-- Anyone could still create a bare auth account with the public anon key, but with no
-- members row, RLS above gives that account access to nothing.
