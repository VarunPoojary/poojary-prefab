/**
 * Tabs on the employee detail page. Each tab is its own route (/employees/:id/<key>).
 * To release a tab in a later phase, set `locked: false` and give it a screen.
 */
export interface EmployeeTab {
  key: "details" | "attendance" | "payroll";
  label: string;
  locked: boolean;
}

export const EMPLOYEE_TABS: EmployeeTab[] = [
  { key: "details", label: "Details", locked: false },
  { key: "attendance", label: "Attendance", locked: false },
  { key: "payroll", label: "Payroll", locked: false },
];

export const tabHref = (employeeId: string, key: EmployeeTab["key"]) => `/employees/${employeeId}/${key}`;
