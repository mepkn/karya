// Fake tickets for trying Karya without Jira. Keys use DEMO- so they never clash with real ones.
export const DEMO_TICKETS = [
  {
    jiraKey: "DEMO-101",
    summary: "Add CSV export to the invoices table",
    descriptionText:
      "Users want to download the filtered invoices list as CSV.\n\n## Acceptance criteria\n- Export respects the current filters and sort\n- Dates in ISO format, amounts without currency symbols\n- Works for up to 10k rows without freezing the tab",
    jiraStatus: "To Do",
    issueType: "Story",
    priority: "Medium",
    dueDate: undefined,
  },
  {
    jiraKey: "DEMO-102",
    summary: "Login fails intermittently on Safari after token refresh",
    descriptionText:
      "Reported by support: some Safari users are logged out roughly once an hour.\n\nSuspect the refresh call races with the tab regaining focus. No reliable repro yet.\n\n```\nTypeError: Load failed\n  at refreshSession (auth.ts:88)\n```",
    jiraStatus: "In Progress",
    issueType: "Bug",
    priority: "High",
    dueDate: undefined,
  },
  {
    jiraKey: "DEMO-103",
    summary: "Migrate notification emails to the new template service",
    descriptionText:
      "The Platform team's template service replaces our Handlebars templates.\n\n1. Map the 9 existing templates\n2. Switch the sender behind a feature flag\n3. Remove the old templates after a week\n\nAPI docs are still a draft; coordinate with Platform (their sprint ends Friday).",
    jiraStatus: "To Do",
    issueType: "Task",
    priority: "Medium",
    dueDate: undefined,
  },
  {
    jiraKey: "DEMO-104",
    summary: "Dark mode for the settings page",
    descriptionText: "Settings still renders light colours in dark mode. Use the existing theme tokens.",
    jiraStatus: "To Do",
    issueType: "Story",
    priority: "Low",
    dueDate: undefined,
  },
  {
    jiraKey: "DEMO-105",
    summary: "Rate limit the public search API",
    descriptionText:
      "Add a per-key limit of 60 requests/minute to /api/search, returning 429 with Retry-After.\n\n- Limits stored in Redis\n- Admin keys exempt\n- Add metrics for rejected calls",
    jiraStatus: "Selected for Development",
    issueType: "Task",
    priority: "High",
    dueDate: "2026-11-06",
  },
];
