import type { Metadata } from "next";
import { ClientOnly } from "@/components/ClientOnly";

export const metadata: Metadata = { title: "Quotations · Poojary Prefab" };

export default function QuotationsPage() {
  return <ClientOnly screen="dashboard" />;
}
