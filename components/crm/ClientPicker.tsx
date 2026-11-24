"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/fields";
import { CONTACT_ROLES, labelOf } from "@/lib/crm/config";
import { useClient, useClientSearch } from "@/lib/crm/hooks";
import { formatPhone } from "@/lib/crm/rules";
import type { Client, Contact } from "@/lib/crm/types";
import { SearchSelect, useDebounced } from "./ui";

/** Fills the quotation's client block from the Client List (company, city, contact person). */
export function ClientPicker({
  clientId,
  onPick,
  onClear,
}: {
  clientId?: string;
  onPick: (client: Client, contact: Contact | undefined) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<Client | null>(null);
  const q = useDebounced(query, 200);
  const { data: results = [], isFetching } = useClientSearch(q, open && !picked);
  const { data: linked } = useClient(clientId);

  const finish = (c: Client, contact?: Contact) => {
    onPick(c, contact);
    setOpen(false);
    setPicked(null);
    setQuery("");
  };

  if (!open) {
    return (
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm">
        {clientId ? (
          <span className="text-slate-700">
            From Client List:{" "}
            <Link href={`/clients/${clientId}`} target="_blank" className="font-semibold text-slate-900 hover:underline">
              {linked?.name ?? "…"}
            </Link>
          </span>
        ) : (
          <span className="text-slate-500">Not linked to the Client List.</span>
        )}
        <span className="flex gap-2">
          {clientId ? (
            <Button size="sm" variant="ghost" onClick={onClear}>
              Unlink
            </Button>
          ) : null}
          <Button size="sm" onClick={() => setOpen(true)}>
            {clientId ? "Change client" : "Pick from Client List"}
          </Button>
        </span>
      </div>
    );
  }

  return (
    <div className="mb-4 rounded-lg border border-red-200 bg-red-50/30 p-3">
      {!picked ? (
        <SearchSelect
          label="Search the Client List"
          placeholder="Company, contact, phone or email…"
          autoFocus
          query={query}
          onQuery={setQuery}
          loading={isFetching}
          options={results.map((c) => {
            const p = c.contacts.find((x) => x.primary) ?? c.contacts[0];
            return { value: c.id, label: c.name, sub: [p?.name, p?.phone ? formatPhone(p.phone) : "", c.city].filter(Boolean).join(" · ") };
          })}
          onSelect={(id) => {
            const c = results.find((x) => x.id === id)!;
            if (c.contacts.length <= 1) finish(c, c.contacts[0]);
            else setPicked(c);
          }}
          footer={
            <Link href="/clients/new" target="_blank" className="text-xs font-medium text-red-700 hover:underline">
              + Add a new client (opens in a new tab)
            </Link>
          }
        />
      ) : (
        <div>
          <div className="mb-2 text-sm text-slate-700">
            Kind attention for <b>{picked.name}</b>:
          </div>
          <div className="flex flex-wrap gap-2">
            {picked.contacts.map((c) => (
              <Button key={c.id} size="sm" variant={c.primary ? "primary" : "secondary"} onClick={() => finish(picked, c)}>
                {c.name} ({labelOf(CONTACT_ROLES, c.role)})
              </Button>
            ))}
          </div>
        </div>
      )}
      <div className="mt-2 text-right">
        <Button size="sm" variant="ghost" onClick={() => (setOpen(false), setPicked(null))}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
