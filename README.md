# TaskFlow (Obsidian-backed)

A local task and planning app that uses your **Obsidian vault as the database**. Tasks are read from `PROJECTS/*/Execution plan.md` and `RESOURCES/Open and recurring tasks.md`. The UI is inspired by **Things** (clean, minimal, rounded).

## Features

- **Obsidian as database** – No separate database; all tasks live in your vault.
- **Task overview** – All tasks grouped by **priority** (high / normal / low) and **topic** (project, section, task type).
- **Planning** – Week, month, and year views for tasks with due or start dates.
- **Today view** – Tasks due or scheduled for today; placeholder for calendar meetings.
- **Schedule view** – Day or week calendar with time slots (7:00–22:00). Shows Outlook meetings and **scheduled tasks** (tasks you drag to a time slot). Open tasks are listed in a sidebar; drag one onto a slot to schedule it. Schedule is stored in `backend/scheduled.json` (local only).
- **9:00 weekday reminder** – Desktop notification at 9:00 on weekdays with a short summary of your day (task count). Optional: integrate Outlook and Google Calendar for meetings in the same summary.

## Quick start

### 1. Backend (Node.js)

From the `task-app` folder:

```bash
cd backend
npm install
npm start
```

The API runs at **http://localhost:3111**. By default it uses the parent of `task-app` as the vault path (your PhD folder).

**Important:** For Outlook COM (Option 2 below) you must have a real config file. Copy the example and edit it:

```bash
cd backend
copy config.example.json config.json
```

Then edit `config.json`: set `"outlookUseCom": true` for Outlook meetings, and adjust `vaultPath` / `reminderTime` if needed. Or set `OBSIDIAN_VAULT_PATH`, `REMINDER_TIME`, and `OUTLOOK_USE_COM=true` in the environment.

### 2. Frontend (Vite + React)

In a second terminal:

```bash
cd frontend
npm install
npm run dev
```

Open **http://localhost:3112**. The frontend proxies `/api` to the backend.

### 3. One-click start (desktop shortcut)

To start both backend and frontend with one double-click:

- **Double-click** the **Task App** shortcut on your desktop (if it was created). It opens two terminal windows: one for the backend, one for the frontend. Then open http://localhost:3112 in your browser.
- Or run **`start-task-app.bat`** from the `task-app` folder.
- To (re)create the desktop shortcut: from `task-app`, run  
  `powershell -ExecutionPolicy Bypass -File create-desktop-shortcut.ps1`

### 4. Reminder (weekdays at 9:00)

The backend runs a cron job that sends a **desktop notification** on weekdays at 9:00 (timezone: Europe/Amsterdam by default). The message includes how many tasks are due or scheduled for today. To change the time, set `reminderTime` in `config.json` or `REMINDER_TIME` (e.g. `08:30`).

## Task format (Obsidian)

The app parses the same format as your vault and PARA conventions:

- Checklist: `- [ ]` (open), `- [x]` (done).
- **Due date**: `📅 YYYY-MM-DD`
- **Start date**: `🛫 YYYY-MM-DD`
- **Done date**: `✅ YYYY-MM-DD`
- **Recurrence**: `🔁 every week` (or similar)
- **Tags**: `#project/<slug>`, `#task/<type>`, `#archived` (low priority)

Tasks are grouped by **priority** (has due/start = high, `#archived` = low, else normal) and by **topic** (section heading, project name, task type).

## Outlook calendar (no app registration)

If your **work Outlook** is managed by IT and you can’t register an Azure app, you can still show meetings in the Today view and in the 9:00 reminder using one of these options. **No admin or app registration required.**

### Option 1: ICS calendar URL (recommended)

Many Outlook/Exchange setups let you **publish** or **share** your calendar and get a **subscription link** (ICS URL).

1. In **Outlook on the web** (office.com): go to **Calendar** → **Shared calendars** (or **Share** / **Publish**).
2. Choose your calendar and the detail level (e.g. “Can view titles and locations”).
3. Copy the **link** (often an `https://.../owa/...` or `https://outlook.office.com/...` URL that returns `.ics` content).
4. In `backend/config.json` set:
   ```json
   "outlookIcsUrl": "https://your-ics-subscription-url-here"
   ```
   If the link is protected (e.g. requires login), some orgs provide a “secret” or “private” link; you can also try `outlookIcsAuth` with a Bearer token if your org supports it (less common).

The backend fetches that URL and parses today’s events. No Azure app, no admin approval.

### Option 2: Outlook desktop (Windows only)

If you use **Outlook desktop** on Windows and it’s open (or can be started), the app can read your **default calendar** via COM. No Azure app, no URL.

1. In `backend/config.json` set:
   ```json
   "outlookUseCom": true
   ```
2. Restart the backend. On weekdays at 9:00 and when you open the Today view, the backend runs a small PowerShell script that uses Outlook’s COM interface to list today’s appointments.

**Requirements:** Windows, Outlook desktop installed, and (for the script to succeed) Outlook is running or can be started. If Outlook isn’t running, the script may start it; if your org blocks COM, this option won’t work and you’ll need the ICS URL instead.

**Troubleshooting Outlook COM:** If you set `outlookUseCom: true` but no meetings appear:
1. **Restart the backend** after changing config.
2. **Open Outlook desktop** (the script uses the default calendar; Outlook may need to be running).
3. **Check the backend terminal** when you open the Today view or refresh: it may log `Outlook COM: N event(s)` or a PowerShell error.
4. **Test the script manually** (PowerShell, from `task-app/backend`):
   ```powershell
   .\scripts\Get-OutlookCalendar.ps1 (Get-Date -Format "yyyy-MM-dd")
   ```
   You should see a JSON array of today’s appointments. If you see `[]` or an error, fix that first (e.g. start Outlook, check execution policy).

### Option 3: Local ICS file

If you can **export** your calendar to an `.ics` file (e.g. from Outlook: File → Save Calendar, or a manual export), you can point the app at that file. It’s not live (you need to re-export to refresh), but it needs no permissions.

In `backend/config.json`:
```json
"outlookIcsFile": "C:\\path\\to\\your\\calendar.ics"
```

---

**Summary:** Prefer **Option 1 (ICS URL)** if your org gives you a calendar link. Use **Option 2 (Outlook COM)** on Windows with Outlook desktop if you can’t get a link. Use **Option 3 (ICS file)** as a fallback.

## Google Calendar

Google Calendar still requires OAuth (create a project in [Google Cloud Console](https://console.cloud.google.com/), enable the Calendar API, download credentials). Set `GOOGLE_CALENDAR_CREDENTIALS` to the path to your credentials JSON if you want Google events in the Today view and reminder.

## Project layout

```
task-app/
├── backend/           # Node + Express
│   ├── config.js         # Vault path, reminder, calendar (ICS / COM)
│   ├── config.json         # Your config (create from config.example.json)
│   ├── scheduled.json       # Your scheduled task time slots (created on first schedule)
│   ├── calendarService.js   # ICS fetch + parse, Outlook COM (Windows)
│   ├── scheduleStore.js    # Read/write scheduled.json
│   ├── scripts/
│   │   └── Get-OutlookCalendar.ps1   # PowerShell COM script
│   ├── vaultParser.js    # Parse Execution plans + RESOURCES tasks
│   └── server.js         # API + cron reminder
├── frontend/           # Vite + React
│   └── src/
│       ├── views/      # Today, Overview, Planning
│       └── App.jsx
└── README.md
```

## Conventions

This app follows your **PARA automation conventions** and reads from the same Execution plan and RESOURCES files as `scripts/export_tasks.py`. It does not write to the vault; tasks are edited in Obsidian.
