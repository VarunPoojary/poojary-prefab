import { ADMIN_ROLE, roleHasPage, type PageKey } from "./auth/roles";
import type { User } from "./auth/types";

export interface NavItem {
  key: string;
  label: string;
  href: string;
  description: string;
  /** Only the Admin role sees it (Employees, Settings). Other items follow each role’s pages in Settings. */
  adminOnly?: boolean;
  /** Also shown to Staff assigned as factory / office attendance supervisors. */
  supervisors?: boolean;
  status: "ready" | "soon";
}

/** Modules shown in the menu. Add new modules here. */
export const NAV_ITEMS: NavItem[] = [
  {
    key: "enquiries",
    label: "Enquiries",
    href: "/enquiries",
    description: "Track every enquiry to a win or loss",
    status: "ready",
  },
  {
    key: "clients",
    label: "Clients",
    href: "/clients",
    description: "Client list and contact persons",
    status: "ready",
  },
  {
    key: "quotations",
    label: "Quotation Maker",
    href: "/quotations",
    description: "Create, edit and download quotations",
    status: "ready",
  },
  {
    key: "projects",
    label: "Projects",
    href: "/projects",
    description: "Won orders from design to handover",
    status: "ready",
  },
  {
    key: "factory-dashboard",
    label: "Factory dashboard",
    href: "/factory",
    description: "Pending factory work and priorities",
    status: "ready",
  },
  {
    key: "site-dashboard",
    label: "Site dashboard",
    href: "/sites",
    description: "Progress and daily updates of all sites",
    status: "ready",
  },
  {
    key: "my-tasks",
    label: "My tasks",
    href: "/my-tasks",
    description: "Project tasks assigned to you",
    status: "ready",
  },
  {
    key: "attendance",
    label: "Attendance",
    href: "/attendance",
    description: "Daily attendance of all employees",
    supervisors: true,
    status: "ready",
  },
  {
    key: "payroll",
    label: "Payroll",
    href: "/payroll",
    description: "Salaries, advances and payments",
    status: "ready",
  },
  {
    key: "expenses",
    label: "Expenses",
    href: "/expenses",
    description: "Project expenses: approve and pay",
    status: "ready",
  },
  {
    key: "employees",
    label: "Employees",
    href: "/employees",
    description: "Employee records and logins",
    adminOnly: true,
    status: "ready",
  },
  {
    key: "settings",
    label: "Settings",
    href: "/settings",
    description: "Roles and access, templates and lists",
    adminOnly: true,
    status: "ready",
  },
];

export interface AccessContext {
  /** The user supervises factory / office attendance. */
  supervisor?: boolean;
}

export function canAccess(user: Pick<User, "role"> | null, item: Pick<NavItem, "key" | "adminOnly" | "supervisors">, ctx: AccessContext = {}): boolean {
  if (!user) return false;
  if (user.role === ADMIN_ROLE) return true;
  if (item.adminOnly) return false;
  return roleHasPage(user.role, item.key as PageKey) || (!!item.supervisors && !!ctx.supervisor);
}

/** Pages outside the menu rules: a role with Payroll may open an employee's Payroll tab. */
export function canAccessPath(user: Pick<User, "role"> | null, pathname: string, ctx: AccessContext = {}): boolean {
  if (!user) return false;
  if (user.role !== ADMIN_ROLE && roleHasPage(user.role, "payroll") && /^\/employees\/[^/]+\/payroll\/?$/.test(pathname)) return true;
  const item = activeNavItem(pathname);
  return !item || canAccess(user, item, ctx);
}

export function visibleNavItems(user: Pick<User, "role"> | null, ctx: AccessContext = {}): NavItem[] {
  return NAV_ITEMS.filter((i) => canAccess(user, i, ctx));
}

export function activeNavItem(pathname: string): NavItem | undefined {
  return NAV_ITEMS.find((i) => pathname === i.href || pathname.startsWith(`${i.href}/`));
}

export const DEFAULT_ROUTE = "/quotations";

/** Where a user lands after signing in (and on the logo link): the first page of the menu they may open. */
export function homeFor(user: Pick<User, "role"> | null, ctx: AccessContext = {}): string {
  if (!user || canAccess(user, NAV_ITEMS.find((i) => i.href === DEFAULT_ROUTE)!, ctx)) return DEFAULT_ROUTE;
  return visibleNavItems(user, ctx)[0]?.href ?? DEFAULT_ROUTE;
}

/** Only allow redirects to paths inside this app (prevents open redirects via ?next=). */
export function safeNext(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\") || next.startsWith("/login"))
    return DEFAULT_ROUTE;
  return next;
}
