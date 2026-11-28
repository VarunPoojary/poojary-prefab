# Poojary Prefab – Business App

A web app for running Poojary Prefab Pvt. Ltd.: from the first client enquiry, through the quotation, to the project on site
(progress, attendance, expenses) and the monthly payroll.

| Module | ☰ Menu | Who can use it | What it does |
|---|---|---|---|
| Quotation Maker | Quotation Maker | Admin, Staff | Step-by-step quotation form with live preview and PDF on the letterhead |
| CRM | Enquiries, Clients | Admin, Staff | Clients with contacts; enquiries from first call to Finalised / Declined |
| Projects | Projects, My tasks | Admin, Staff (own team) | Auto-created from Finalised enquiries; details, money, progress, timeline |
| Dashboards | Factory dashboard, Site dashboard | Admin, roles given these pages | All projects' factory work by priority; every site's progress, delays, crews and daily updates (no money) |
| Attendance | Attendance (+ project / employee tabs) | Admin, supervisors, site managers | Daily attendance at sites, factory and office; casual workers |
| Expenses | Expenses (+ project tab) | Admin, Accountant, site managers | Request → accept → pay; budget vs actual |
| Payroll | Payroll (+ employee tab) | Admin, Accountant | Salary from attendance, advances, close month, settle all, salary slips |
| Employees | Employees | Admin | Employee records, logins, salaries, documents |
| Settings | Settings | Admin | Task templates, lists, attendance and payroll settings |

> **Storage:** with Supabase configured (see [Connect Supabase](#connect-supabase)) all data, logins and files are kept
> in the Supabase project and shared by every user and device. Without it the app falls back to this browser
> (localStorage, files in IndexedDB): each browser has its own data, and clearing browser data or **Reset demo data**
> starts again from the demo data. See [Architecture & data](#architecture--data).

## Contents

1. [Run it](#run-it) – [Connect Supabase](#connect-supabase)
2. [Demo accounts & demo data](#demo-accounts--demo-data)
3. [Roles & permissions](#roles--permissions)
4. [Modules](#modules) – [Sign-in](#1-sign-in-navigation--my-account) · [Quotations](#2-quotation-maker) ·
   [CRM](#3-crm--clients--enquiries) · [Projects](#4-projects) · [Attendance](#5-attendance) ·
   [Expenses](#6-expenses) · [Payroll](#7-payroll) · [Employees](#8-employees) · [Settings](#9-settings) ·
   [Notifications](#10-notifications-) · [Files](#11-files)
5. [Sanity test flows](#sanity-test-flows) – step-by-step test cases for every module
6. [Architecture & data](#architecture--data)
7. [Where to change things](#where-to-change-things)
8. [Automated checks](#automated-checks)

---

## Run it

```bash
npm install
npm run dev          # http://localhost:3000
```

Production build: `npm run build && npm start`. To build while `npm run dev` is running, use a separate folder:
`NEXT_DIST_DIR=.next-build npm run build && NEXT_DIST_DIR=.next-build npm start`.

After pulling new code, restart `npm run dev` (new pages) and use **Reset demo data** if the demo data has changed.

### Connect Supabase

1. Create a project at [supabase.com](https://supabase.com) (region close to India, e.g. Mumbai).
2. **Create the tables:** Supabase dashboard → *SQL Editor* → paste and run
   [`supabase/migrations/20261124000000_init.sql`](supabase/migrations/20261124000000_init.sql), then
   [`supabase/migrations/20261124000001_grants.sql`](supabase/migrations/20261124000001_grants.sql), then
   [`supabase/migrations/20261128000000_custom_roles.sql`](supabase/migrations/20261128000000_custom_roles.sql) (or `supabase db push`
   with the Supabase CLI). They create `app_records`, `file_meta`, the table privileges, the row level security
   policies, realtime and the private Storage bucket `files`. *permission denied for table app_records* means the
   second file has not been run.
3. **Keys:** copy `.env.example` to `.env.local` and fill in from *Project Settings → API*: the project URL, the
   publishable / anon key and the service-role / secret key. The service-role key is used only by the server (API routes
   and the seed script) – never give it a `NEXT_PUBLIC_` name.
4. **Starting data** (replaces everything; add `--force` if the database already has data):

   ```bash
   npm run db:seed -- --demo                                          # demo data + demo logins (below)
   npm run db:seed -- --starter --username admin@poojary.net --password '<first password>'   # real use: one admin, no demo records
   ```

   With `--starter` the admin is the demo director's employee record (edit it in Employees) and must choose a new
   password at first sign-in.
5. Restart `npm run dev`. The Quotation Maker footer shows *Storage: Supabase cloud database*.

For a demo project you can also set `NEXT_PUBLIC_SHOW_DEMO_ACCOUNTS=true` (demo logins on the login page) and
`ALLOW_DEMO_RESET=true` (lets an admin use **Reset demo data**, which then replaces **all** data in Supabase). Leave both
off for the real database. When deploying (e.g. Vercel), set the same variables in the host's environment settings.

---

## Demo accounts & demo data

Sign in at `/login` with the **username** (or the employee's mobile number) and password:

| Username | Password | Person | Role / what it shows |
|---|---|---|---|
| admin@poojary.net | Admin@123 | Naresh S Poojary (Director) | **Admin** – everything |
| staff@poojary.net | Staff@123 | Vaishali Joshi | **Staff**; office attendance supervisor |
| priya@poojary.net | Staff@123 | Priya Deshmukh | **Staff**; project manager of the Nagpur project |
| rahul@poojary.net | Staff@123 | Rahul Jadhav | **Staff**; site engineer at Nagpur, PM of Sanaswadi, factory attendance supervisor |
| accounts@poojary.net | Staff@123 | Meera Kulkarni | **Accountant** – Payroll and Expenses only |
| sneha@poojary.net | Staff@123 | Sneha Kale | Staff – must choose a new password at first sign-in |
| kavita@poojary.net | Staff@123 | Kavita Shinde | Disabled login (shows the "disabled" message) |

**Reset demo data:** Quotation Maker list (`/quotations`) → **Reset demo data**. It reloads every module's demo data
(quotations, clients, enquiries, employees, projects, attendance, expenses, payroll, settings, notifications) and
clears stored files. Do this before a sanity run so the steps below match. With Supabase it works only when the server
has `ALLOW_DEMO_RESET=true`, replaces the data for **every** user and resets the demo logins' passwords
(`npm run db:seed -- --demo --force` does the same from the command line).

What the demo data contains (dates are relative to today):

| Area | Demo data |
|---|---|
| Quotations | 3 real quotations (Agartala, Poly houses, Stairs) + 7 made-up ones, Draft and Final, BOQ and area-based |
| Clients | 10 clients (Thermax, DRA Infracon, Kalyani Steels, Mahindra Logistics, L&T, Bharat Forge, Afcons, Tata Projects, Green Valley Agro, Sunrise Cold Chain – inactive) |
| Enquiries | ~11 enquiries in every status: Finalised (Agartala, Poly houses), Quotation Sent (Stairs), Revision Sent (Warehouse at Chakan – Kalyani), On hold (Mahindra), Revision Requested (Bharat Forge canteen), Declined (Sunrise), plain Enquiry … |
| Employees | 10 employees (EMP-0001 … EMP-0010) incl. Ganesh Pawar (welder, **daily wage**), Sunil More (erection supervisor), Amit Kulkarni (left in June) |
| Projects | **PRJ-2026-001 Poly houses at RIL, Nagpur** (erection, attendance on), **PRJ-2026-002 Godown at Sanaswadi** (factory, casual crew), **PRJ-2026-003 Factory shed – Talegaon**, **PRJ-2026-004 Cold storage – Nashik** (on hold), **PRJ-2025-001 Agartala** (completed) |
| Attendance | From the 1st of last month: office, factory and both sites. Nagpur is deliberately **not logged yesterday** and 10 days ago (to show reminders / red rows); Sundays are site holidays; one festival company holiday; 12 casual workers |
| Expenses | ~60 expenses on the projects: purchases, crane hire, casual labour per site day. Nagpur has a **pending paint request** (accepting it takes Factory work over 80 % → budget alert), a rejected duplicate, a deleted entry, and 3 site days with casual workers but no labour expense. Agartala's Transportation is over budget |
| Payroll | Last month: advances (Sunil ₹10,000, Kavita ₹40,000), closed and settled in one batch for most employees; **Sunil partly paid**, **Priya still open**. Kavita's advance: ₹18,000 recovered (50 % cap), ₹22,000 carried. This month: advances to Vaishali and Rahul |

---

## Roles & permissions

**Custom roles.** Admins manage roles in **Settings → Roles and access**: add, rename or delete a role and tick the
pages it can open (Enquiries, Clients, Quotation Maker, Projects, My tasks, Attendance, Payroll, Expenses). Give a
person a role on their employee page → **Application login → Role**.

- **Admin** is built in: every page, and the only role that manages Employees, Settings and roles. It can't be edited
  or deleted.
- **Staff** and **Accountant** are the starting roles (the columns below); they can be edited like any other role.
- Inside a page, every non-Admin role works like the Staff column below, except:
  a role with **Payroll** does what the Accountant column shows for payroll (including an employee's Payroll tab);
  a role with **Expenses** sees all expenses and marks accepted ones as paid;
  a role with **Attendance** marks factory and office attendance like a supervisor of both (last 7 days).
- Everything marked Admin-only below stays Admin-only for every custom role.
- A role still given to a login can't be deleted; change those people's role first.

The starting roles:

| Action | Admin | Staff | Accountant |
|---|---|---|---|
| Quotations, Clients, Enquiries | ✔ | ✔ | ✘ |
| Projects | All | Only projects whose team they are on (PM always) | ✘ |
| Project money (value, payments, budget) | ✔ | ✘ | ✘ |
| Project progress, tasks, notes | ✔ | ✔ (team) | ✘ |
| Site attendance (log / edit last 7 days) | ✔ (any date) | Site managers of the project | ✘ |
| Attendance page | ✔ | Factory / office supervisors (their location only) | ✘ |
| Project expenses: see / request | ✔ | Site managers of the project | ✘ |
| Expenses: accept, reject, edit, delete, budget vs actual | ✔ | ✘ | ✘ |
| Expenses: mark Accepted as Paid, Expenses page | ✔ | ✘ | ✔ |
| Payroll page, employee Payroll tab, advances, close month, settle all | ✔ | ✘ | ✔ |
| Reopen a closed month, edit / delete payroll payments, reverse a settlement | ✔ | ✘ | ✘ |
| Employees, logins, salaries | ✔ | ✘ | ✘ (Payroll tab only) |
| Settings | ✔ | ✘ | ✘ |

*Site manager* = the project manager, or a team member with the role **Site engineer / Erection supervisor**
(between their team from / to dates). *Supervisors* are chosen in Settings → Attendance.

Permission checks run in the app. With Supabase the database also enforces the coarse rules (row level security):
only enabled logins can read or change anything; logins, employees, lookups and settings only admins; payroll only
admins and roles with the Payroll page (needs `20261128000000_custom_roles.sql`). The finer rules (team membership, the 7-day window, …) are not yet enforced by the database
– see [Architecture & data](#architecture--data).

---

## Modules

### 1. Sign-in, navigation & My account

- `/login` – username or mobile number + password. No sign-up / forgot password: admins create logins in Employees.
- Passwords are stored only as hashes (Supabase Auth; PBKDF2 in browser-only mode). **5 wrong passwords lock the
  login for 15 minutes** (checked by the server route `/api/auth/login`).
- A login with a temporary password must choose a new one at `/change-password` before anything else.
- Every page except login requires sign-in; opening a link while signed out goes to login and then back to the link.
- The session lasts 8 hours or until the tab is closed (each tab signs in separately). It is re-checked on every page
  change, on focus and every 30 s – a disabled login or reset password signs the user out at once; a role change
  applies straight away.
- After sign-in: Admin / Staff land on **Quotations**; the Accountant lands on **Payroll**.
- **☰** (top-left) opens the module menu (only the modules the user may open). The top bar shows the current module,
  the 🔔 bell and the avatar menu (**My account**, **Log out**). Opening a page you can't use shows *No access*.
- **My account** (`/account`): your details, previous sign-in, change password.

### 2. Quotation Maker

- **List** (`/quotations`): every quotation with search (offer no., client, contact, subject, site), filters
  (Draft / Final, BOQ / Area, linked / unlinked to an enquiry), sorting (last updated, date, offer no., amount) and
  paging. Click a row to edit. **⋮** per row: Edit, Duplicate, New revision, Download PDF, Link to enquiry…, Delete.
- **+ New quotation** → choose a starting point (blank BOQ, blank area-based, or a copy of an earlier quotation). The
  next offer number is filled in automatically.
- **Wizard** (8 steps, `/quotations/new` then `/quotations/<id>`):
  1. **Client & Offer** – client (or *Pick from Client List*), contact, offer no., date, revision, subject, project, site.
  2. **Cover Letter** – salutation, one rich-text editor for the letter body, signatory.
  3. **Pricing** – BOQ table (item library, quantities, rates) or area-based pricing; GST, totals and amount in words
     are calculated automatically.
  4. **Scope & Specs** – scope blocks / specifications.
  5. **Terms & Conditions** – payment terms (advance / inspection / balance %), delivery, validity, etc.
  6. **Scope Matrix** – who does what (tick marks or Client / PPPL text).
  7. **Annexures** – photos and extra pages.
  8. **Review & Download** – summary, checks (missing fields), file name and **Download PDF**.
- **Autosave** about 1.5 s after typing stops (status in the header); **Save** saves at once.
- **Draft / Final** status in the header; editing a Final quotation suggests creating a new revision.
- **Live preview** (wide screens) updates as you type and scrolls to the section of the step you open.
- **PDF**: A4 on the company letterhead – header, footer band flush with the page bottom and watermark on every page.
- **Link to an enquiry**: from the Review step, the enquiry page, or the list. Each enquiry numbers its quotations
  R0, R1, R2… (the quotation's Revision becomes 00, 01, 02). When a linked quotation becomes **Final**, the enquiry
  moves to *Quotation Created* (R0) or *Revision Created* (R1+).

### 3. CRM – Clients & Enquiries

- **Clients** (`/clients`): name, contact persons (one primary), lead source (*Referral* needs "Referred by"),
  address, state, GSTIN, notes, active / inactive. Duplicate phone / email and similar names are flagged before saving.
  A client with enquiries can't be deleted (mark it inactive). The client page lists its contacts, enquiries,
  quotations and projects.
- **Enquiries** (`/enquiries`): **+ New enquiry** picks (or creates) the client, then the requirement (project, site,
  building type, scope, size, expected decision, assigned to, attachments). Numbered `ENQ-<year>-<nnnn>`.
  The list has status chips with counts, filters (status, client, dates, lead source, assignee, *Needs follow-up*),
  search and sorting.
- **Statuses:** Enquiry → Quotation Created → Quotation Sent → Revision Requested → Revision Created → Revision Sent,
  plus Follow-up and On hold (with a follow-up date), and the closed statuses:
  - **Finalised** – needs the accepted quotation and the PO / LOI number and date; creates the project.
  - **Declined** – needs a reason; can be reopened with a comment.
  Closed enquiries are read-only except notes. Admins can reopen a Finalised enquiry (comment required); its project
  then shows a warning.
- **Enquiry page:** details (editable, with attachments), the linked quotations with *Create quotation*,
  *Revision from latest*, *Link existing quotation*, the status control, notes and the full activity timeline.
- **Follow-ups (🔔):** open enquiries with no update for 7 days, and On-hold enquiries whose follow-up date has come.

### 4. Projects

- **Automatic creation:** saving an enquiry as **Finalised** creates exactly one project `PRJ-<year>-<nnn>`, pre-filled
  with client, contact, site, building details, value (before / with GST), payment milestones from the quotation's
  payment terms, PM = the enquiry's assignee, and the 6 stages with their task templates. Admins get a 🔔. Admins can
  also create a project by hand (**+ New project**).
- **List** (`/projects`): search, filters (status – Active and On hold by default, current stage, PM, client, start
  dates, 🚩 behind schedule), sorting; value / received for admins; cards on phones.
- **Header:** overall %, current stage, planned vs **expected** completion (forecast after 10 % progress); for admins
  value, received % and **budget used**. Admins change the status (On hold / Cancelled need a reason; Completed when
  Handover reaches 100 %).
- **Details tab**
  - A. Information – enquiry / quotation links, map pin (*Use my current location*, *Open in Google Maps*), steel MT
    (*Fill MT totals*), planned completion with baseline (later changes need a reason).
  - B. Client contacts. C. Internal team (role, from / to) and external parties.
  - D. **Money** (admin only) – value and GST, variations → revised value, payment milestones (received / overdue),
    payments received, totals, and the **budget by work stage**: Design, Factory work, Transportation, Site work
    (erection, quality, handover) and **Labour** (fabrication, erection, casual). Each line shows budget, % of budget
    and **actual** spend from Expenses (% used, red when over); planned and actual margin; casual labour from
    attendance; employee labour on site (man-days × salary ÷ 30, information only).
  - E. Documents (PO, drawings, anchor plan, contract, handover…).
  - F. **Timeline** – every automatic entry plus notes with tags, photos / files and @mentions; filter by type, tag,
    person and dates; click an entry to jump to its task, payment or expense.
- **Progress tab** – 6 stage cards (weights 10 / 40 / 10 / 30 / 5 / 5, admin-editable, total 100; *Not applicable*
  rescales the others); planned stage dates (*Suggest dates*); tasks (Quantity with unit + total, or Percent); phone
  friendly **+ Update** (backdating allowed, no future dates, never above the total, negative corrections admin-only
  with a note, site photos); delay reason required once a task or stage is late; S-curve (planned vs actual); site
  labour for the last 7 days and productivity per task.
- **Expenses tab** and **Attendance tab** – see below.
- **My tasks** (`/my-tasks`): your open tasks, behind-schedule first, with *+ Update*.

#### Factory dashboard (`/factory`) and Site dashboard (`/sites`)

Read-only overviews across **all** active (and on-hold) projects for anyone whose role has the page (Settings →
Roles and access). Neither shows money. Calculations live in `lib/dashboards/` (pure functions, unit-tested).

- **Factory dashboard** – projects whose factory stage is below 100%, as a **priority queue**: pinned projects first
  (*Pin to top* with a reason, visible to all), then blocked, behind, at risk, then the least spare time before the
  **dispatch-by** date (transport planned start, else factory planned end). Each project shows factory % against the
  planned % for today, steel to finish (MT, averaged over the MT processes because the same steel passes through
  each), MT/week achieved (last 4 weeks) vs needed, spare days at that rate, last update and last delay reason, and
  its factory tasks. Side panels: pending work per process (where work piles up), steel finished per week (6 weeks)
  against the rate needed, factory tasks due in 14 days, and factory delay reasons (90 days) by days lost.
  *At risk* = 7 days or less to spare, needing over 25% more than the current rate, or nothing produced for 4 weeks
  with dispatch within 3 weeks.
- **Site dashboard** – **Daily updates**: for each active site with attendance on, today's *attendance* and
  *progress* (at least one update) and a 7-day strip (both / one / neither / still time / holiday), with *Log
  attendance* / *Post progress* links. **Site cards**, most behind first: overall % vs planned % today, each stage's
  % vs plan, planned vs expected finish, % per day achieved (7 days) vs needed, people on site today vs 7-day average
  (flagged when a behind site has fewer people than usual), progress per man-day, late or blocked tasks, open delay
  reasons. Side panels: crew today, site tasks due in 14 days, site delay reasons (90 days), stages late without a
  delay reason. *My sites only* is on by default for people on a site's team (off for Admin).

### 5. Attendance

One record per person per day (status + location), shown in three places that always agree: the project's
**Attendance** tab, the employee's **Attendance** tab and the **Attendance** page.

- **Statuses:** Present (1 day), Half day (0.5), Absent, Holiday; no record = *Not logged*. **Locations:** Site (a
  project), Factory, Office – per day. Location is required for Present / Half day.
- **Rules:** no future dates; site managers and supervisors can change today and the last 7 days (older: Admins);
  nobody before joining or after leaving; every change keeps history; a person already marked elsewhere that day gives
  a conflict (*Keep existing* / *Replace*).
- **Project → Attendance:** one row per day (employees, casual workers, man-days, logged by, *edited*), Not-logged
  days in red with **Log now** (today only after its reminder time). **Log attendance** popup (phone-first): search
  employees and casual workers, add a new casual worker, Present / Half / Absent / Holiday buttons, notes, *Copy
  previous day*, *Mark all present*, **required group photo** (location checked – warning beyond 1 km from the site
  pin), *Mark site holiday*, confirmation summary. Each save adds a timeline entry. Admins switch site attendance on /
  off and set the project's reminder time.
- **Employee → Attendance:** the month day by day with a summary (Present, Half, Absent, Holiday, Not logged,
  Days worked).
- **Attendance page** (☰): **Employees** daily sheet (summary chips, filters, inline and bulk marking, *Mark day as
  holiday*, remarks, *Sites not logged* strip), **Casual workers** (that day + register with edit / merge) and the
  **Monthly register** (muster roll, CSV).
- **Reminders:** at the reminder time (default 18:00) to site managers; at 10:00 next morning again, also to Admins.
  Browser pop-ups can be turned on from the bell.

### 6. Expenses

All amounts are exact to the paisa (stored in paise, never floating point).

- **Project → Expenses** (Admins and the project's site managers): newest first; search (description, paid to, bill
  no., requested by); filters (work stage, status, requested by, project stage, dates, *Show deleted* for admins);
  totals (Accepted, Paid, Pending, Rejected, Spend). Tap a row for all fields, the bill, the history and the actions.
- **Expense fields:** date (up to 7 days ahead), **work stage** (Design, Factory work, Transportation, Site work,
  Labour – the budget line it counts against), description, amount incl. GST, GST part, paid to, quantity + unit,
  project stage, bill photo / PDF (optional), bill number; payment mode, date and reference (optional) when paid.
  Codes `EXP-<year>-<nnnn>`.
- **Flow:** site managers **request** (Requested; admins notified; they can't edit or withdraw). Admins add directly
  as Requested / Accepted / Paid, **accept**, **mark paid**, **reject** (reason), **edit** (reason when the amount or
  work stage of an accepted / paid expense changes) and **delete** (soft, reason; visible with *Show deleted*).
  Only **Accepted + Paid** count as spend. Every step is a timeline entry (Admins + site managers); the requester is
  notified when it is accepted, paid or rejected.
- **Budget vs actual** (admins): per work stage – budget, spent, remaining, % used, red when over. 📊 alerts at 80 %
  and 100 % of a stage's budget.
- **Duplicate warning** (doesn't block): same bill number, or same paid to + amount within a day.
- **Casual labour:** *Fill from attendance* lists the day's casual workers at the site with their daily rate
  (present = full, half day = half), editable; one request per site day. A strip lists site days with casual workers
  but no labour expense yet; each opens a pre-filled request.
- **Expenses page** (☰, Admin and Accountant): every project; tabs *To approve* (admins), *To pay*, *All*; filters;
  select + bulk *Accept* / *Mark paid*; CSV export. The Accountant can only mark Accepted expenses as Paid.

### 7. Payroll

Only employees with a **monthly** salary are in payroll; daily-wage employees and casual workers are not.

- **Salary rule:** daily rate = monthly salary ÷ **30** (every month). Loss-of-pay (LOP) days = Absent + ½ × Half days
  + days outside employment (before joining / after leaving). Gross = daily rate × max(0, 30 − LOP days), **rounded
  once** to the nearest rupee. Holidays are paid. A salary change in the month is weighted by calendar days. No
  Present / Half / Holiday day at all → ₹0. A month with no LOP pays the full salary whatever its length.
- **Advances** are recovered when the month is closed: at most the lower of the advance outstanding and **50 % of
  gross** (Code on Wages, rounded down); the rest carries forward. The Admin can recover less.
- **Employee → Payroll tab** (Admin, Accountant):
  - **Month card** – live estimate while open, frozen once closed: monthly salary, daily rate, days (P / ½ / A / H /
    Not logged / still to come), deductions, gross, advances, recovery, adjustments, net payable, paid, balance,
    advance outstanding. **Tap any line** for its working (day grid, formulas). Warnings for Not-logged days.
  - Checks shown under the card (days add up; net = gross − recovery ± …; balance = net − paid).
  - **Give advance**, **Pay salary** (balance or a part payment), **Other payment** (bonus, reimbursement – not part of
    net), **Close month** (from the 1st of next month; blocked while a day is Not logged, the previous month is open or
    a check fails; recovery pre-filled with the maximum; one-off additions / deductions with a reason),
    **Reopen** (admin; latest closed month with nothing paid), **⬇ Salary slip** (PDF on the letterhead).
  - Attendance edited after closing doesn't change the closed month; the difference is shown and added to the next
    month closed as an adjustment.
  - **Year view** (one row per month) and the **payments list** (date, type, for month, amount, mode + reference, paid
    by, remarks; admins edit / delete with a reason, history kept).
- **Payroll page** (☰): month selector; summary (total monthly salary, gross, advances, recovery, net, paid,
  balance); chips (*Not logged days*, *advance outstanding*) that filter; list with totals row equal to the summary;
  search and filters; per row *Advance*, *Pay*, *View*; **Export CSV**; **Settle all…**; settlements with **Reverse…**
  (admin, reason); **Payroll activity log**.
- **Settle all:** choose a finished month → review (closes ready employees, lists who is left out and why; recovery
  can be lowered) → payment date, mode, batch reference (per-employee references optional) → **type the exact total**
  to confirm → one salary payment per employee for exactly the balance, in one batch. Running it again, or paying
  someone afterwards, finds nothing left – a payment can never exceed the balance.
- **Reminder:** from the 3rd of each month, Admins and the Accountant get 💰 while last month isn't fully paid
  (wages are due by the 7th).

### 8. Employees

Admin only (the Accountant sees just the Payroll tab).

- **List** (`/employees`): search, filters (department, designation, employment type, status, has login), sorting,
  **Export CSV** (never includes salary); ⋮ View, Edit, Manage login, Deactivate / Reactivate.
- **Add / Edit:** tabs Basic · Job · Salary · Emergency contact · Documents (red dot on tabs with errors). Codes
  `EMP-0001…`, never reused. Checks: unique valid mobile, age 18+, joining after birth, salary > 0. Salary is monthly
  or daily with an effective date (history kept).
- **Detail tabs:** Details (salary current / upcoming / history, login, documents, change history), **Attendance**,
  **Payroll**.
- **Logins:** create (Staff, Accountant or Admin; a temporary password is shown once with *Copy* / *Copy WhatsApp
  message*), reset password, change role, disable / enable. The last active admin can't be demoted, disabled or
  deactivated; admins can't disable themselves.
- **Deactivate** (leaving date + reason; login disabled; hand open enquiries to someone), **Reactivate**, **Delete
  permanently** (only with no linked records – enquiries, quotations, attendance, expenses, payroll…; type the full
  name to confirm).

### 9. Settings

Admin only (`/settings`). Changes apply to new data; list entries are archived rather than deleted.

- **Project task templates** – the default tasks of each stage.
- **Lists** – delay reasons, project roles, external party types, note tags, units, trades (casual workers).
- **Attendance** – default reminder time; factory and office supervisors.
- **Payroll** – first payroll month (empty = month of the first attendance record).

### 10. Notifications 🔔

The bell shows stored notifications (unread dot, *Mark all read*) plus enquiry follow-ups. Clicking one opens the
related page.

| Icon | Notification | Who gets it |
|---|---|---|
| 🏗️ | Project created from a Finalised enquiry | Admins |
| 💬 | @mention in a project note | The person mentioned |
| ☑️ | Task assigned | The assignee |
| 💰 | Payment milestone overdue | Admins |
| ⚠️ | Finalised enquiry reopened | Admins |
| 🗓️ | Site attendance not logged (reminder time / 10:00 next day) | Site managers (+ Admins next day) |
| ☑️ | No progress posted on a site day (same timing; site and company holidays skipped) | Site managers (+ Admins next day) |
| 💸 | Expense requested | Admins |
| 🧾 | Expense accepted / paid / rejected | The requester |
| 📊 | Work stage spend reached 80 % / 100 % of budget | Admins |
| 💰 | Last month's salaries not fully paid (from the 3rd) | Admins, Accountant |
| – | Enquiry needs follow-up (separate *Enquiry follow-ups* list in the bell) | Assignee (or creator) |

### 11. Files

Uploads (enquiry attachments, employee documents, project documents, progress / note / attendance photos, expense
bills) are kept in the private Supabase Storage bucket `files` (browser-only mode: **IndexedDB**); records keep only a
file id. Photos are shrunk on the device (longest
side 1600 px) and the time taken is read from the photo. Limit 10 MB per file. Quotation photos live inside the
quotation because they are drawn into the PDF.

---

## Sanity test flows

Use these to check the whole app after a change. **Before starting:** sign in as Admin, open Quotation Maker →
**Reset demo data**, and use a desktop browser window (the phone checks are at the end). Each case lists who to sign
in as, the steps and the expected result (✅). To switch user: avatar → **Log out**.

### A. Sign-in, navigation & access

| # | As | Steps | ✅ Expected |
|---|---|---|---|
| A1 | – | Open `/projects` while signed out | Redirected to `/login`; after signing in as Admin you land back on `/projects` |
| A2 | – | Sign in with a wrong password 5 times for `priya@poojary.net` | Error each time; then "locked until hh:mm" (15 min). (Use another user afterwards) |
| A3 | – | Sign in as `kavita@poojary.net` / Staff@123 | "This login is disabled…" message |
| A4 | – | Sign in as `sneha@poojary.net` / Staff@123 | Forced to *Change password*; after a valid new password → Quotations |
| A5 | Admin | Open ☰ | Enquiries, Clients, Quotation Maker, Projects, My tasks, Attendance, Payroll, Expenses, Employees, Settings |
| A6 | Staff (`priya@`) | Open ☰; then open `/employees`, `/settings`, `/payroll` | Menu without Attendance / Payroll / Expenses / Employees / Settings; each URL shows *No access* |
| A7 | Staff (`staff@`) | Open ☰ | Includes **Attendance** (she is the office supervisor) |
| A8 | Accountant | Sign in as `accounts@poojary.net` | Lands on **Payroll**; ☰ shows only Payroll and Expenses; `/quotations` and `/projects` show *No access* |
| A9 | Any | Avatar → **My account** → change password; log out and sign in with the new one | Works; the old password fails |
| A10 | Admin + Staff | In tab 1 as Admin disable Priya's login (Employees → Priya → Login); in tab 2 Priya is signed in | Priya is signed out within ~30 s / on next click |

### B. Quotation Maker

| # | As | Steps | ✅ Expected |
|---|---|---|---|
| B1 | Admin | Open Quotation Maker | List with 10 quotations; search "Agartala" finds it; filters Draft / Final and BOQ / Area work; sorting changes the order |
| B2 | Admin | **+ New quotation** → blank BOQ | Wizard opens at step 1 with the next offer number |
| B3 | Admin | Fill client (try *Pick from Client List* → Thermax), subject, site; go through every step with **Next →** | Header shows *Saving… / Saved*; the preview updates and jumps to the section of each step |
| B4 | Admin | Pricing: add 2 BOQ items with quantities and rates | Amounts, GST, grand total and amount in words calculate; preview matches |
| B5 | Admin | Cover Letter: edit the letter body | One editor; text shows in the preview |
| B6 | Admin | Review & Download → **Download PDF** | PDF downloads; every page has the letterhead header, footer at the very bottom, watermark |
| B7 | Admin | Set status to **Final**, then edit a field | Suggests creating a new revision |
| B8 | Admin | List → ⋮ on a quotation → **Duplicate**, **New revision**, **Download PDF**, **Delete** (confirm) | Copy with new offer no.; revision +1; PDF downloads; deleted row disappears |
| B9 | Admin | Reload the browser on an open quotation | Data is still there (autosaved) |

### C. CRM – Clients & Enquiries

| # | As | Steps | ✅ Expected |
|---|---|---|---|
| C1 | Staff | Clients → **+ New client** with a phone already used by Thermax | Duplicate warning before saving |
| C2 | Staff | Create a client with 2 contacts (one primary), lead source *Referral* without "Referred by" | Validation asks for "Referred by"; after filling it saves; client page shows contacts |
| C3 | Staff | Try to delete a client that has enquiries | Not allowed – suggests marking inactive |
| C4 | Staff | Enquiries → **+ New enquiry** for the new client, assign to Rahul, attach a PDF | Gets `ENQ-<year>-nnnn`, status *Enquiry*; attachment opens from the enquiry page |
| C5 | Staff | On the enquiry → **Create quotation**, fill and set it **Final** | Enquiry moves to *Quotation Created* automatically; quotation shows R0 / revision 00 |
| C6 | Staff | Change the enquiry status to *Quotation Sent*, then *Revision Requested* → **Revision from latest** → Final | Status becomes *Revision Created*; new quotation is R1 / revision 01 |
| C7 | Staff | Set *On hold* with a follow-up date of today | Enquiry appears under *Needs follow-up* and in the 🔔 |
| C8 | Staff | Set *Declined* without a reason, then with a reason; reopen it | Reason required; reopen asks for a comment; timeline lists every change |
| C9 | Admin | Open *Warehouse at Chakan* (Kalyani, Revision Sent) → status **Finalised**: choose the accepted quotation, PO number and date | Saved; a project **PRJ-2026-005** is created; Admin 🔔 "project created"; the enquiry links to it |
| C10 | Admin | Reopen that Finalised enquiry (comment) | The project shows "Linked enquiry is no longer Finalised" with **Keep project** / **Cancel project** |
| C11 | Staff | Quotation Maker list → filter *Unlinked* → ⋮ **Link to enquiry…** | Quotation linked; appears on the enquiry |

### D. Projects – details, money, timeline

| # | As | Steps | ✅ Expected |
|---|---|---|---|
| D1 | Admin | Projects | Active and On-hold projects; filters (status, stage, PM, 🚩 behind) work; value / received columns |
| D2 | Admin | Open the project from C9 | Pre-filled client, site, value with GST, milestones from the quotation terms, PM = assignee, 6 stages with tasks |
| D3 | Admin | Details → A. *Use my current location* (allow), *Fill MT totals*, change planned completion | Pin saved; MT filled; changing the planned date asks for a reason; baseline kept |
| D4 | Admin | C. add a team member (role *Site engineer / Erection supervisor*) and an external party | Shown in the lists; the member now sees the project |
| D5 | Admin | D. Money: **Edit value**, **+ Add variation**, **Edit milestones**, **+ Record payment** | Revised value, received %, outstanding and overdue milestones update; header tiles update |
| D6 | Admin | D. Money → **Edit budget**: enter all 5 lines incl. **Labour** | Budget table shows Design, Factory work, Transportation, Site work, Labour with % of budget; planned margin updates |
| D7 | Admin | Open Nagpur (PRJ-2026-001) → Money | *Actual* per work stage with % used; actual margin; casual labour line; *Employee labour on site* (expand) |
| D8 | Admin | E. Documents: upload a PO PDF | Listed; opens / downloads |
| D9 | Admin | F. Timeline: add a note with a tag, a photo and @Rahul | Note appears; Rahul gets 🔔 *mention* |
| D10 | Admin | Timeline filters (type *Expenses*, person, dates); click an expense entry | Filtered list; clicking opens the Expenses tab with that expense expanded |
| D11 | Staff (`priya@`) | Open Nagpur (she is PM) | No Money section, no value / budget tiles, no payment entries in the timeline |
| D12 | Staff (`priya@`) | Open Talegaon by URL | "You are not on this project's team." |
| D13 | Admin | **Change status** → On hold without a reason | Reason required; with a reason the banner shows it |

### E. Projects – progress & tasks

| # | As | Steps | ✅ Expected |
|---|---|---|---|
| E1 | Admin | Nagpur → Progress | 6 stage cards with weights, %, behind flags; S-curve chart; *Site labour (last 7 days)* card |
| E2 | Admin | Stage weights → change so they don't total 100 | Error; total must be 100 |
| E3 | Admin | Mark *Quality check* **Not applicable** | Other weights rescale; overall % changes |
| E4 | Admin | **+ Add task** (Quantity, unit MT, total 10, assigned to Rahul) | Task listed; Rahul gets 🔔 *task assigned* |
| E5 | Staff (`rahul@`) | My tasks → **+ Update** on that task: 4 MT, yesterday, a photo | Progress 40 %; future dates refused; more than the total refused |
| E6 | Staff (`rahul@`) | Post a negative correction | Refused (admin-only); as Admin it needs a note |
| E7 | Admin | Set a task's planned end in the past and post an update | Delay reason required |
| E8 | Admin | Planned stage dates → **Suggest dates** | Dates spread over the project schedule |
| E9 | Admin | Talegaon (Handover not done) vs a project at 100 % | *Mark completed* banner only when Handover is 100 % |

### F. Attendance

| # | As | Steps | ✅ Expected |
|---|---|---|---|
| F1 | Staff (`rahul@`) | 🔔 | "PRJ-2026-001: attendance for <yesterday> still not logged" (after 10:00) – click opens the log popup for yesterday |
| F2 | Admin | Nagpur → Attendance | One row per day; yesterday and 10 days ago **Not logged** in red; Sundays *Holiday*; click a logged day → people + photo |
| F3 | Staff (`rahul@`) | **Log now** on yesterday → *Copy previous day* | People from the last logged day are added |
| F4 | Staff (`rahul@`) | Search "Ganesh" and add him; search a casual worker "Zz Test" → *+ Add new casual worker* (trade required) | Both added to the list |
| F5 | Staff (`rahul@`) | Try **Save…** without a photo | Disabled until a group photo is added |
| F6 | Staff (`rahul@`) | Add a photo → **Save…** → **Confirm and save** | Conflict panel: Ganesh is at the Factory – choose **Replace**; save succeeds; summary showed counts; timeline entry added |
| F7 | Staff (`rahul@`) | Expand the day → **Edit** → change a person to Absent → save | Row shows *edited*; history kept |
| F8 | Staff (`rahul@`) | Open `?log=` with a date 20 days ago / in the future | Date picker limited to the last 7 days and today |
| F9 | Admin | Sanaswadi → Attendance → *+ Log attendance* → **🏖️ Mark site holiday** | Day shows *Holiday*; no reminder for it |
| F10 | Admin | Employees → Ganesh → Attendance | Month view with daily rows and summary (Present / Half / Absent / Holiday / Not logged / Days worked) |
| F11 | Admin | ☰ Attendance (Employees tab) | Summary chips; *Sites not logged* strip; click *Not logged* chip filters; search filters |
| F12 | Admin | Mark one person Present at Office inline; select all Not-logged → bulk *Factory* → **Mark selected** | Toasts "saved" / "n marked"; chips update |
| F13 | Admin | **Mark day as holiday** | Everyone without a record becomes Holiday |
| F14 | Admin | Casual workers tab → edit a worker's daily rate; **Merge** a duplicate | Saved; merged days moved |
| F15 | Admin | Monthly register → **Export CSV** | `attendance-register-<yyyy-mm>.csv` downloads |
| F16 | Staff (`staff@`, office supervisor) | Attendance page | Can mark only *Office*; days older than 7 are read-only; no Monthly register / not-logged strip |
| F17 | Staff (`priya@`) | `/attendance` | *No access* (not a supervisor) |

### G. Expenses

| # | As | Steps | ✅ Expected |
|---|---|---|---|
| G1 | Admin | Nagpur → Expenses | List newest first; totals chips; **Budget vs actual** card; deleted entries hidden; *Show deleted* reveals them |
| G2 | Admin | Search "crane"; filter status *Requested*; filter work stage; dates | Each filter narrows the list |
| G3 | Admin | Expand "Paint for touch-up" (Requested) → **Accept** | Status Accepted; Factory work goes to ~80 %; 🔔 📊 "Factory work spend reached 80% of budget"; Rahul gets 🧾 "accepted" |
| G4 | Admin | Expand a Requested expense → **Reject** | Reason required; status Rejected; requester notified |
| G5 | Admin | Expand an Accepted expense → **Edit** → change the amount → Save | "Reason" required; history shows old → new; timeline "edited: amount ₹… → ₹…" |
| G6 | Admin | **+ Add expense**: Work stage *Factory work*, description, amount `18500.50`, GST, paid to, bill number already used (e.g. `UF/2231`) | Duplicate warning (still allowed). Change the bill no., add a bill photo, *Save as* **Paid** with no reference → saved as Paid, amount shows ₹18,500.50 |
| G7 | Admin | Check the work stage choices | Exactly: Design, Factory work, Transportation, Site work, Labour |
| G8 | Admin | Expand the new expense → **Delete** with a reason | Hidden from the list; visible with *Show deleted*; timeline "deleted: …" |
| G9 | Admin | Yellow strip *Casual labour not requested yet* → click a day | Dialog pre-filled from attendance (workers, rates, total; work stage Labour) → Save; the day disappears from the strip |
| G10 | Admin | Accepted expense → **Mark paid** without a reference | Saved as Paid (reference optional) |
| G11 | Admin | Agartala → Expenses | Transportation row red (over budget) |
| G12 | Admin | Nagpur → Details → Money / header | Actual column and *Budget used* % reflect the changes above |
| G13 | Staff (`rahul@`) | Nagpur → Expenses → **+ Request expense** → Send | Status Requested; no budget card; expanded row has no Accept / Edit / Delete / Mark paid; admin-added expenses visible |
| G14 | Staff (`rahul@`) | Try *Fill from attendance* for a day already requested | "Already requested (EXP-…)" – can't save |
| G15 | Staff (`sneha@` – after A4; design member on Talegaon) | Talegaon → Expenses | "Only the project's site managers and admins can see its expenses." |
| G16 | Admin | ☰ Expenses → *To approve* → select 2 → **Accept selected** | Moved to *To pay* |
| G17 | Accountant | ☰ Expenses | Tabs *To pay*, *All* only; select one → **Mark selected paid** (no reference needed) → it leaves *To pay*; expanded row has no Accept / Edit / Delete; **Export CSV** downloads |

### H. Payroll

| # | As | Steps | ✅ Expected |
|---|---|---|---|
| H1 | Accountant | ☰ Payroll (this month) | Summary tiles; *live estimate*; Ganesh listed as *Not in payroll (daily wage)*; totals row = summary; Balance = Net − Paid |
| H2 | Accountant | Click the chips *with Not logged days* / *with advance outstanding*; search; department / status filters | List filters; a *Filtered* subtotal row appears |
| H3 | Accountant | Row *Advance* for Kavita → 20000 | Shows outstanding ₹22,000 and estimated salary; warns it is more than the salary; after saving, *Advances given this month* rises by ₹20,000 |
| H4 | Accountant | **‹** to last month | Most rows *Paid*, Sunil *Partly paid*, Priya *Open*; *Settlements* card shows `SAL-<month>-1` |
| H5 | Accountant | **Settle all…** (last month) | Ready: Priya (closes now) and Sunil (balance); recovery editable for Priya; left-out list if any |
| H6 | Accountant | Next → batch reference → Next → type a wrong total | **Record payments** stays disabled |
| H7 | Accountant | Type the exact total → **Record payments** | Result lists who was paid; balance tile ₹0; every row *Paid* |
| H8 | Accountant | **Settle all…** again; look for *Pay* buttons | Nothing to pay; no *Pay* buttons |
| H9 | Accountant | Row *View* for Kavita (last month) | Payroll tab with only the Payroll tab in the header; month card frozen: salary ₹36,000, recovery ₹18,000, net ₹18,000; payments list shows the advance and salary |
| H10 | Accountant | Tap *Days*, *Deductions*, *Gross* lines | Each opens its working (day grid / formula) |
| H11 | Accountant | `/employees/e_kavita/details` | *No access* |
| H12 | Admin | Employees → Vaishali → Payroll (this month) | *live estimate*; no *Close month* (month not ended); *Give advance* available |
| H13 | Admin | Employees → Ganesh → Payroll | "Daily-wage worker – not in payroll" |
| H14 | Admin | Kavita → Payroll → last month → **⬇ Salary slip** | PDF on the letterhead with days, rates, gross, recovery, net, payments |
| H15 | Admin | Payroll (last month) → Settlements → **Reverse…** on `SAL-…-1` with a reason | Those employees go back to *Closed* (balance due again); the activity log shows the reversal |
| H16 | Admin | Kavita → last month → payments → **Edit** a salary payment to more than the balance | Refused ("At most ₹… can be paid"); a smaller change needs a reason and is kept in history |
| H17 | Admin | A closed month with no salary paid → **Reopen** (reason) | Month is *Open* again; close it again with a lower recovery and a one-off bonus (reason required) → net reflects both |
| H18 | Admin | Edit attendance of a closed month (Attendance page → previous date → change a Present to Absent), then open that employee's Payroll for that month | Closed figures unchanged; amber note "Attendance changed after closing: −₹…"; the current month shows it under *Adjustments* |
| H19 | Admin | Employees → Rahul → Payroll (this month) | Red warning that past days are Not logged (Nagpur yesterday / 10 days ago); the estimate doesn't deduct them. After F6 logs yesterday, the count drops |
| H20 | Admin / Accountant | 🔔 (from the 3rd of the month) | 💰 "Salaries for <last month> not fully paid" (until everyone is paid) |

### I. Employees

| # | As | Steps | ✅ Expected |
|---|---|---|---|
| I1 | Admin | Employees list: search, filters, sort, **Export CSV** | CSV without salary |
| I2 | Admin | **+ Add employee** with missing fields | Red dots on tabs with errors; messages listed |
| I3 | Admin | Add a valid employee (monthly salary) → **Create login** as Staff | Next code `EMP-0011`; temporary password shown once with *Copy WhatsApp message* |
| I4 | – | Sign in with that temporary password | Forced password change |
| I5 | Admin | Edit the employee's designation; add an upcoming salary | Change history shows old → new; salary history lists the upcoming entry |
| I6 | Admin | Login card → **Reset password**, change role to **Accountant**, disable / enable | Each works; as Accountant the user sees only Payroll / Expenses |
| I7 | Admin | Try to demote / disable yourself (the only admin) | Refused |
| I8 | Admin | **Deactivate** Sneha (leaving date, reason, hand over enquiries to Priya) | Login disabled; her open enquiries reassigned; status Inactive; **Reactivate** brings her back with login still disabled |
| I9 | Admin | **Delete permanently** an employee with records (e.g. Rahul) | Refused – lists linked records (attendance, expenses, payroll…); a brand-new employee can be deleted after typing the full name |

### J. Settings

| # | As | Steps | ✅ Expected |
|---|---|---|---|
| J1 | Admin | Settings → Project task templates → add a task to *Factory work* → save | New projects get it; existing ones don't |
| J2 | Admin | Lists → add a delay reason; archive a note tag | Appears in dropdowns; archived one hidden for new entries but still shown on old ones |
| J3 | Admin | Attendance → change reminder time; add Priya as office supervisor | Priya now sees ☰ Attendance (Office only) |
| J4 | Admin | Payroll → set *Payroll starts from* to this month | Payroll page for last month says "Payroll starts from …"; clear it again afterwards |

### K. Notifications

| # | As | Steps | ✅ Expected |
|---|---|---|---|
| K1 | Admin | Open 🔔 | Unread dots; clicking an item opens its page and marks it read; *Mark all read* clears the count |
| K2 | Any site manager | 🔔 → *Turn on pop-up reminders* → allow | Attendance reminders also pop up as browser notifications |
| K3 | Admin | ☰ → *Factory dashboard* | Godown at Sanaswadi first (Behind, raw-material / plant-capacity delays); *Pin to top* Talegaon with a reason → it moves to 01; *Unpin* → back |
| K4 | Admin | ☰ → *Site dashboard* | Nagpur and Sanaswadi in *Daily updates* with a 7-day strip; post a progress update on Nagpur → *Progress posted* for today |
| K5 | Admin, then Accountant | Settings → Roles → tick *Factory dashboard* for Accountant → sign in as accounts@poojary.net | Menu shows Factory dashboard; no ₹ anywhere; `/sites` shows *No access* |

### L. Phone checks (narrow window ≈ 390 px or a real phone)

| # | As | Steps | ✅ Expected |
|---|---|---|---|
| L1 | Staff (`rahul@`) | Projects list | Cards instead of a table |
| L2 | Staff (`rahul@`) | Nagpur → Attendance → *+ Log attendance* | Popup fits the screen; big status buttons; *Take group photo* opens the camera |
| L3 | Staff (`rahul@`) | Progress → **+ Update** | Form fits; *Add site photos* opens the camera / gallery |
| L4 | Admin | Nagpur → Expenses → **+ Add expense** | Dialog fits; bill photo button opens the camera |

### M. End-to-end business flow (one pass through everything)

1. **Staff** creates a client and an enquiry (C2, C4) → creates the quotation and sets it Final (C5) → marks *Quotation Sent*.
2. **Admin** finalises the enquiry with PO details (C9) → the project is created (D2) → sets the budget incl. Labour (D6)
   and adds Rahul to the team as *Site engineer / Erection supervisor* (D4).
3. **Rahul** logs today's site attendance with casual workers and a photo (F3–F6), posts a progress update (E5) and
   requests a casual-labour expense with *Fill from attendance* (G9) and a crane expense (G13).
4. **Admin** accepts both and sees Labour / Site work actuals in Money (G3, G12); the **Accountant** marks them paid (G17).
5. At month end: **Accountant** closes the month and settles everyone (H5–H7), downloads a salary slip (H14).
6. Check that the timeline of the project lists the enquiry finalisation, attendance, progress and every expense step.

---

## Architecture & data

Every module talks to storage through a **repository interface**; screens use React Query hooks (`hooks.ts`) and
never touch storage directly. The repositories (with all business rules) work on `lib/storage.ts`, which is either
the **Supabase database** or this browser's localStorage – chosen by whether `NEXT_PUBLIC_SUPABASE_URL` /
`NEXT_PUBLIC_SUPABASE_ANON_KEY` are set.

### Supabase mode

| Part | Where | How |
|---|---|---|
| Data | table `app_records` | One row per record: `collection` (the storage key, e.g. `pppl.projects.v1`), `id`, `data` (JSONB), `pos` (list order). Counters, lookups and settings are one row with id `$value`. Key → id field map: `lib/supabase/collections.ts` |
| Sync | `lib/supabase/sync-storage.ts` | After sign-in all rows are loaded into memory; a change writes only the rows that changed; every repository is wrapped (`withCloudSync`) so a save resolves only once the database accepted it – if it refuses, the list is re-read and the error is shown. Other users' changes arrive by Supabase Realtime and the screens refresh |
| Sign-in | Supabase Auth + `app/api/auth/*` | Each login is a Supabase Auth user (internal e-mail `<employee id>@users.poojary-prefab.app`, `app_metadata.employee_id`). `/api/auth/login` finds the login by username / mobile, applies the lockout and the disabled check, then returns the Supabase session. `/api/auth/change-password` changes the user's own password. Role, enabled, must-change and session version stay in the login record |
| Login admin | `app/api/admin/logins` | Create login / reset password set the temporary password in Supabase Auth (admins only, service-role key on the server) |
| Files | Storage bucket `files`, table `file_meta` | `lib/files/supabase-store.ts` |
| Starting data | `npm run db:seed`, `app/api/admin/reset-demo` | `lib/supabase/demo-data.ts` builds the data with the same repositories and seeds |
| Security | `supabase/migrations/…_init.sql` | RLS: enabled logins read everything; logins / employees / lookups / settings writable by admins only; payroll by admins and the Accountant; everything else by any enabled login. A disabled login loses database access at once |

**Known limits (next steps):** the finer permission rules (staff see only their projects, no money for staff, the
7-day attendance window, …) still run only in the app – a signed-in user calling the Supabase API directly could
read all data (including salaries) and change records outside the admin/payroll lists. Codes and counters (EXP, PRJ,
ENQ numbers) are handed out by the browser, so two users creating at the same second could collide. Moving those rules
into Postgres functions / per-table RLS, or into server routes, is the way to close this. Data saved earlier in a
browser's localStorage is not copied to Supabase automatically.

### Browser-only mode (no Supabase settings)

The table below shows each module's switch file and implementations; the `api-repo.ts` files are an alternative REST
implementation kept for reference.

| Module | Switch | Browser implementation | API implementation | Rules (reuse on the server) |
|---|---|---|---|---|
| Sign-in | `lib/auth/index.ts` | `mock-service.ts`, `crypto.ts` | `api-service.ts` | – |
| Quotations | `lib/data/index.ts` | `session-repo.ts`, `seed.ts` | `api-repo.ts` | `lib/calc.ts`, `lib/money.ts`, `lib/validate.ts` |
| CRM | `lib/crm/index.ts` | `session-repo.ts`, `seed.ts` | `api-repo.ts` | `lib/crm/rules.ts` |
| Employees | `lib/employees/index.ts` | `local-repo.ts`, `store.ts`, `seed.ts` | `api-repo.ts` | `lib/employees/rules.ts` |
| Projects | `lib/projects/index.ts` | `local-repo.ts`, `build.ts`, `seed.ts` | `api-repo.ts` | `lib/projects/rules.ts` |
| Attendance | `lib/attendance/index.ts` | `local-repo.ts`, `seed.ts` | `api-repo.ts` | `lib/attendance/rules.ts` |
| Expenses | `lib/expenses/index.ts` | `local-repo.ts`, `seed.ts` | `api-repo.ts` | `lib/expenses/rules.ts` |
| Payroll | `lib/payroll/index.ts` | `local-repo.ts` | `api-repo.ts` | `lib/payroll/calc.ts`, `lib/paise.ts` |
| Settings | `lib/settings/index.ts` | `local-repo.ts`, `store.ts` | – | – |
| Notifications | `lib/notifications/index.ts` | `store.ts` | (server creates them) | – |
| Files | `lib/files/index.ts` | `indexeddb-store.ts` | `api-store.ts` | `image.ts`, `exif.ts` |

**Browser storage keys** (localStorage): `pppl.quotations.v2`, `pppl.clients.v1`, `pppl.enquiries.v1`,
`pppl.employees.v1`, `pppl.logins.v1`, `pppl.lookups.v1`, `pppl.projects.v1`, `pppl.project-events.v1`,
`pppl.project-updates.v1`, `pppl.project-delays.v1`, `pppl.project-counters.v1`, `pppl.attendance.v1`,
`pppl.site-days.v1`, `pppl.casual-workers.v1`, `pppl.attendance-holidays.v1`, `pppl.expenses.v1`,
`pppl.expense-counter.v1`, `pppl.payroll-months.v1`, `pppl.payroll-payments.v1`, `pppl.payroll-batches.v1`,
`pppl.payroll-log.v1`, `pppl.settings.v1`, `pppl.notifications.v1`; the sign-in session is in sessionStorage
(`pppl.session.v1`). Files are in IndexedDB. In Supabase mode the same keys are the `collection` values in
`app_records`, and the Supabase session is in sessionStorage (`pppl.supabase-auth`).

**Full server-side rules – what is still to move to the database / server** (partly done with Supabase, see above)

- **Sign-in:** hash passwords, enforce the lockout and session version; add `proxy.ts` for server-side route checks
  with an httpOnly cookie (see the Next.js authentication guide in `node_modules/next/dist/docs`).
- **Permissions:** enforce every rule in [Roles & permissions](#roles--permissions) (today they run in the browser).
- **Quotations / CRM:** search, filter and paging server-side; enquiry numbering and the automatic status change
  inside transactions; the 7-day follow-up as a daily job.
- **Employees:** admin-only access, salaries hidden from others, last-admin rule.
- **Projects:** create the project in the same transaction that finalises the enquiry (one per enquiry); filter by
  team and strip money for Staff; recompute task totals from updates; overdue-milestone alerts as a job.
- **Attendance:** unique key on (person, date); 7-day window and site-manager / supervisor scope; reminders (18:00 /
  10:00) as a scheduled job with push notifications.
- **Expenses:** amounts as integers (paise) or exact decimals; EXP codes; status flow; timeline entries; budget alerts.
- **Payroll:** run `lib/payroll/calc.ts`; write closed months once (frozen with the day snapshot); "never more than the
  balance" inside a transaction; the 3rd-of-month reminder as a job.

Suggested tables: `quotations`, `clients`, `client_contacts`, `enquiries`, `enquiry_events`, `enquiry_attachments`,
`employees`, `employee_salaries`, `employee_documents`, `employee_events`, `logins`, `lookup_values`, `projects`,
`project_team`, `project_contacts`, `project_parties`, `project_variations`, `project_milestones`, `project_payments`,
`project_budget`, `project_documents`, `project_stages`, `project_tasks`, `progress_updates`, `progress_photos`,
`project_events`, `project_delays`, `attendance_records`, `attendance_history`, `site_days`, `site_day_photos`,
`casual_workers`, `attendance_holidays`, `expenses`, `expense_history`, `payroll_months`, `payroll_payments`,
`payroll_payment_history`, `payroll_settlements`, `payroll_log`, `notifications`, `settings_lists`, `task_templates`.

---

## Where to change things

| What | File |
|---|---|
| Company details (name, CIN, address, phones, signatory, image paths) | `config/company.ts` |
| Standard quotation wording (cover letter, BOQ item library, scope blocks, T&C, scope matrix) | `lib/templates.ts` |
| Defaults for new quotations and the example presets | `lib/defaults.ts` |
| Quotation calculations / Indian number format / amount in words | `lib/calc.ts`, `lib/money.ts` |
| PDF letterhead (header, footer band, watermark) and layout | `components/pdf/` |
| Logo, watermark, signature, stamp, standard photos | `public/brand/` |
| ☰ menu entries and who sees them | `lib/navigation.ts` |
| CRM lists (lead sources, decline reasons, building types) and the follow-up days | `lib/crm/config.ts` |
| Project stages, weights, budget work stages, default task templates and lists | `lib/projects/config.ts` |
| Project / employee tabs | `lib/projects/tabs.ts`, `lib/employees/tabs.ts` |
| Attendance statuses, edit window (7 days), reminder times, photo distance | `lib/attendance/config.ts` |
| Expense statuses, payment modes, future-date limit, budget alert levels | `lib/expenses/config.ts` |
| Payroll divisor (30), payment modes, due day | `lib/payroll/calc.ts`, `lib/payroll/config.ts` |
| Supabase tables, row level security, Storage bucket | `supabase/migrations/` |
| Supabase keys and options | `.env.local` (see `.env.example`), `lib/supabase/config.ts` |
| Which role may change which collection in Supabase | `app_can_write()` in `supabase/migrations/…_init.sql` |

Quotation template text can use `{{placeholders}}` filled from form values (full list in `templateVars()` in
`lib/template.ts`, e.g. `{{gstRate}}`, `{{advancePct}}`, `{{validUntil}}`). A line starting with `- ` becomes a bullet,
`1. ` a numbered point.

---

## Automated checks

```bash
npm test                        # unit tests: calculations, rules and every repository (incl. the 7 payroll worked examples)
npm run lint
npx tsc --noEmit                # type check
npm run render:samples -- out   # renders every quotation preset to out/*.pdf for visual checks
```
