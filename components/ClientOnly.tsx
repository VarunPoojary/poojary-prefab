"use client";

import dynamic from "next/dynamic";

// These screens use browser storage, URL state and react-pdf, so they render on the client only.
const loading = () => <div className="p-6 text-sm text-slate-500">Loading…</div>;

const SCREENS = {
  dashboard: dynamic(() => import("./dashboard/Dashboard").then((m) => m.Dashboard), { ssr: false, loading }),
  new: dynamic(() => import("./wizard/screens").then((m) => m.NewQuotationScreen), { ssr: false, loading }),
  edit: dynamic(() => import("./wizard/screens").then((m) => m.EditQuotationScreen), { ssr: false, loading }),
  clients: dynamic(() => import("./crm/ClientsList").then((m) => m.ClientsList), { ssr: false, loading }),
  clientNew: dynamic(() => import("./crm/ClientDetail").then((m) => m.NewClientScreen), { ssr: false, loading }),
  clientEdit: dynamic(() => import("./crm/ClientDetail").then((m) => m.EditClientScreen), { ssr: false, loading }),
  clientDetail: dynamic(() => import("./crm/ClientDetail").then((m) => m.ClientDetail), { ssr: false, loading }),
  enquiries: dynamic(() => import("./crm/EnquiriesList").then((m) => m.EnquiriesList), { ssr: false, loading }),
  enquiryNew: dynamic(() => import("./crm/NewEnquiry").then((m) => m.NewEnquiry), { ssr: false, loading }),
  enquiryEdit: dynamic(() => import("./crm/NewEnquiry").then((m) => m.EditEnquiry), { ssr: false, loading }),
  enquiryDetail: dynamic(() => import("./crm/EnquiryDetail").then((m) => m.EnquiryDetail), { ssr: false, loading }),
  account: dynamic(() => import("./auth/AccountScreen").then((m) => m.AccountScreen), { ssr: false, loading }),
  employees: dynamic(() => import("./employees/EmployeesList").then((m) => m.EmployeesList), { ssr: false, loading }),
  employeeNew: dynamic(() => import("./employees/EmployeeEdit").then((m) => m.NewEmployeeScreen), { ssr: false, loading }),
  employeeEdit: dynamic(() => import("./employees/EmployeeEdit").then((m) => m.EditEmployeeScreen), { ssr: false, loading }),
  employeeDetails: dynamic(() => import("./employees/EmployeeDetail").then((m) => m.EmployeeDetailsTab), { ssr: false, loading }),
  employeeLocked: dynamic(() => import("./employees/EmployeeDetail").then((m) => m.EmployeeLockedTab), { ssr: false, loading }),
  projects: dynamic(() => import("./projects/ProjectsList").then((m) => m.ProjectsList), { ssr: false, loading }),
  projectNew: dynamic(() => import("./projects/NewProject").then((m) => m.NewProject), { ssr: false, loading }),
  projectDetails: dynamic(() => import("./projects/ProjectScreens").then((m) => m.ProjectDetailsTab), { ssr: false, loading }),
  projectProgress: dynamic(() => import("./projects/ProjectScreens").then((m) => m.ProjectProgressTab), { ssr: false, loading }),
  projectLocked: dynamic(() => import("./projects/ProjectScreens").then((m) => m.ProjectLockedTab), { ssr: false, loading }),
  myTasks: dynamic(() => import("./projects/MyTasks").then((m) => m.MyTasks), { ssr: false, loading }),
  factoryDashboard: dynamic(() => import("./dashboards/FactoryDashboard").then((m) => m.FactoryDashboard), { ssr: false, loading }),
  siteDashboard: dynamic(() => import("./dashboards/SiteDashboard").then((m) => m.SiteDashboard), { ssr: false, loading }),
  projectAttendance: dynamic(() => import("./projects/ProjectScreens").then((m) => m.ProjectAttendanceTab), { ssr: false, loading }),
  employeeAttendance: dynamic(() => import("./employees/EmployeeDetail").then((m) => m.EmployeeAttendanceTab), { ssr: false, loading }),
  attendance: dynamic(() => import("./attendance/AttendancePage").then((m) => m.AttendancePage), { ssr: false, loading }),
  projectExpenses: dynamic(() => import("./projects/ProjectScreens").then((m) => m.ProjectExpensesTab), { ssr: false, loading }),
  expenses: dynamic(() => import("./expenses/ExpensesPage").then((m) => m.ExpensesPage), { ssr: false, loading }),
  employeePayroll: dynamic(() => import("./payroll/EmployeePayroll").then((m) => m.EmployeePayrollTab), { ssr: false, loading }),
  payroll: dynamic(() => import("./payroll/PayrollPage").then((m) => m.PayrollPage), { ssr: false, loading }),
  settings: dynamic(() => import("./settings/SettingsScreen").then((m) => m.SettingsScreen), { ssr: false, loading }),
};

export type ScreenKey = keyof typeof SCREENS;

export function ClientOnly({ screen }: { screen: ScreenKey }) {
  const Screen = SCREENS[screen];
  return <Screen />;
}
