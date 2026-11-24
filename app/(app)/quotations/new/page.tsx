import type { Metadata } from "next";
import { ClientOnly } from "@/components/ClientOnly";

export const metadata: Metadata = { title: "New quotation · Poojary Prefab" };

export default function NewQuotationPage() {
  return <ClientOnly screen="new" />;
}
