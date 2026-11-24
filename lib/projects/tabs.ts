/**
 * Tabs on the project page. Each tab is its own route (/projects/:id/<key>).
 * To release a tab in a later phase, set `locked: false` and give it a screen.
 */
export interface ProjectTab {
  key: "details" | "progress" | "expenses" | "attendance";
  label: string;
  locked: boolean;
}

export const PROJECT_TABS: ProjectTab[] = [
  { key: "details", label: "Details", locked: false },
  { key: "progress", label: "Progress", locked: false },
  { key: "expenses", label: "Expenses", locked: false },
  { key: "attendance", label: "Attendance", locked: false },
];

export const projectTabHref = (projectId: string, key: ProjectTab["key"]) => `/projects/${projectId}/${key}`;
