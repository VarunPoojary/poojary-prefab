import type { Metadata } from "next";
import { ClientOnly } from "@/components/ClientOnly";

export const metadata: Metadata = { title: "New client · Poojary Prefab" };

export default function Page() {
  return <ClientOnly screen="clientNew" />;
}
