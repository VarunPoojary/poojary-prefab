/*
 * How each storage key of the browser repositories maps to rows in app_records.
 *  - "rows": the key holds a list; each item is one row, identified by `idField`.
 *  - "value": the key holds one value (counter, lookups, settings), stored as one row with id VALUE_ROW_ID.
 * A key that is not listed is stored as a "value".
 */

export type CollectionKind = { kind: "rows"; idField: string } | { kind: "value" };

export const VALUE_ROW_ID = "$value";

export const COLLECTIONS: Record<string, CollectionKind> = {
  "pppl.quotations.v2": { kind: "rows", idField: "id" },
  "pppl.clients.v1": { kind: "rows", idField: "id" },
  "pppl.enquiries.v1": { kind: "rows", idField: "id" },
  "pppl.employees.v1": { kind: "rows", idField: "id" },
  "pppl.logins.v1": { kind: "rows", idField: "employeeId" },
  "pppl.lookups.v1": { kind: "value" },
  "pppl.projects.v1": { kind: "rows", idField: "id" },
  "pppl.project-updates.v1": { kind: "rows", idField: "id" },
  "pppl.project-events.v1": { kind: "rows", idField: "id" },
  "pppl.project-delays.v1": { kind: "rows", idField: "id" },
  "pppl.project-counters.v1": { kind: "value" },
  "pppl.notifications.v1": { kind: "rows", idField: "id" },
  "pppl.attendance.v1": { kind: "rows", idField: "id" },
  "pppl.site-days.v1": { kind: "rows", idField: "id" },
  "pppl.casual-workers.v1": { kind: "rows", idField: "id" },
  "pppl.attendance-holidays.v1": { kind: "rows", idField: "date" },
  "pppl.expenses.v1": { kind: "rows", idField: "id" },
  "pppl.expense-counter.v1": { kind: "value" },
  "pppl.payroll-months.v1": { kind: "rows", idField: "id" },
  "pppl.payroll-payments.v1": { kind: "rows", idField: "id" },
  "pppl.payroll-batches.v1": { kind: "rows", idField: "id" },
  "pppl.payroll-log.v1": { kind: "rows", idField: "id" },
  "pppl.settings.v1": { kind: "value" },
};

export const collectionKind = (key: string): CollectionKind => COLLECTIONS[key] ?? { kind: "value" };

/** A row as stored in app_records. */
export interface RecordRow {
  collection: string;
  id: string;
  data: unknown;
  pos: number;
}

/** Splits a stored value into rows (used by the seed script and the server). */
export function toRows(key: string, value: unknown): RecordRow[] {
  const c = collectionKind(key);
  if (c.kind === "rows" && Array.isArray(value)) {
    return value.map((item, i) => ({ collection: key, id: String((item as Record<string, unknown>)[c.idField]), data: item, pos: i + 1 }));
  }
  return [{ collection: key, id: VALUE_ROW_ID, data: value, pos: 0 }];
}
