import type { Role, User } from "./auth/types";

export interface NavItem {
  key: string;
  label: string;
  href: string;
  icon: string;
  description: string;
  /** Roles allowed to see the item; omit for everyone. */
  roles?: Role[];
  /** Also shown to Staff assigned as factory / office attendance supervisors. */
  supervisors?: boolean;
  status: "ready" | "soon";
}

/** Modules shown in the ☰ menu. Add new modules here. */
export const NAV_ITEMS: NavItem[] = [
  {
    key: "enquiries",
    label: "Enquiries",
    href: "/enquiries",
    icon: "📋",
    description: "Track every enquiry to a win or loss",
    roles: ["admin", "staff"],
    status: "ready",
  },
  {
    key: "clients",
    label: "Clients",
    href: "/clients",
    icon: "🏢",
    description: "Client list and contact persons",
    roles: ["admin", "staff"],
    status: "ready",
  },
  {
    key: "quotations",
    label: "Quotation Maker",
    href: "/quotations",
    icon: "📄",
    description: "Create, edit and download quotations",
    roles: ["admin", "staff"],
    status: "ready",
  },
  {
    key: "projects",
    label: "Projects",
    href: "/projects",
    icon: "🏗️",
    description: "Won orders from design to handover",
    roles: ["admin", "staff"],
    status: "ready",
  },
  {
    key: "my-tasks",
    label: "My tasks",
    href: "/my-tasks",
    icon: "☑️",
    description: "Project tasks assigned to you",
    roles: ["admin", "staff"],
    status: "ready",
  },
  {
    key: "attendance",
    label: "Attendance",
    href: "/attendance",
    icon: "🗓️",
    description: "Daily attendance of all employees",
    roles: ["admin"],
    supervisors: true,
    status: "ready",
  },
  {
    key: "payroll",
    label: "Payroll",
    href: "/payroll",
    icon: "💰",
    description: "Salaries, advances and payments",
    roles: ["admin", "accountant"],
    status: "ready",
  },
  {
    key: "expenses",
    label: "Expenses",
    href: "/expenses",
    icon: "💸",
    description: "Project expenses: approve and pay",
    roles: ["admin", "accountant"],
    status: "ready",
  },
  {
    key: "employees",
    label: "Employees",
    href: "/employees",
    icon: "👥",
    description: "Employee records and logins",
    roles: ["admin"],
    status: "ready",
  },
  {
    key: "settings",
    label: "Settings",
    href: "/settings",
    icon: "⚙️",
    description: "Project task templates and lists",
    roles: ["admin"],
    status: "ready",
  },
];

export interface AccessContext {
  /** The user supervises factory / office attendance. */
  supervisor?: boolean;
}

export function canAccess(user: Pick<User, "role"> | null, item: Pick<NavItem, "roles" | "supervisors">, ctx: AccessContext = {}): boolean {
  return !!user && (!item.roles || item.roles.includes(user.role) || (!!item.supervisors && !!ctx.supervisor));
}

/** Pages outside the menu rules: the Accountant may open an employee's Payroll tab. */
export function canAccessPath(user: Pick<User, "role"> | null, pathname: string, ctx: AccessContext = {}): boolean {
  if (!user) return false;
  if (user.role === "accountant" && /^\/employees\/[^/]+\/payroll\/?$/.test(pathname)) return true;
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
