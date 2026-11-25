/*
 * The one icon set of the app (lucide), at one stroke. Configs in lib/ stay free of React and refer to icons by key.
 */
import { Banknote, Building2, CalendarDays, CircleCheck, ClipboardCheck, ClipboardList, Factory, FileText, Handshake, HardHat, Layers, ListChecks, NotebookPen, PencilLine, PencilRuler, Receipt, Settings, TrendingUp, Truck, type LucideIcon, Users, Wallet } from "lucide-react";
import type { EventType, StageKey } from "@/lib/projects/types";

export type { LucideIcon };

/** Default size and stroke used everywhere. */
export const ICON = { size: 16, strokeWidth: 1.5 } as const;

/** Menu modules, by NavItem.key. */
export const NAV_ICONS: Record<string, LucideIcon> = {
  enquiries: ClipboardList,
  clients: Building2,
  quotations: FileText,
  projects: Layers,
  "my-tasks": ListChecks,
  attendance: CalendarDays,
  payroll: Wallet,
  expenses: Receipt,
  employees: Users,
  settings: Settings,
};

/** The six project stages. */
export const STAGE_ICONS: Record<StageKey, LucideIcon> = {
  design: PencilRuler,
  factory: Factory,
  transport: Truck,
  erection: HardHat,
  quality: CircleCheck,
  handover: Handshake,
};

/** Project timeline event types. */
export const EVENT_ICONS: Record<EventType, LucideIcon> = {
  note: NotebookPen,
  progress: TrendingUp,
  task: ClipboardCheck,
  stage: Layers,
  detail: PencilLine,
  payment: Banknote,
  expense: Receipt,
  attendance: HardHat,
};

/** Renders an icon with the shared size and stroke; colour comes from the surrounding text. */
export function Icon({
  icon: I,
  size = ICON.size,
  className,
  label,
}: {
  icon: LucideIcon;
  size?: number;
  className?: string;
  /** Accessible name; omit for decorative icons. */
  label?: string;
}) {
  return (
    <I
      size={size}
      strokeWidth={ICON.strokeWidth}
      className={`shrink-0 ${className ?? ""}`}
      aria-hidden={label ? undefined : true}
      aria-label={label}
      role={label ? "img" : undefined}
    />
  );
}
