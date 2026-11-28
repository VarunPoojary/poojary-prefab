import type { Metadata } from "next";
import { ClientOnly } from "@/components/ClientOnly";

export const metadata: Metadata = { title: "Site dashboard · Poojary Prefab" };

export default function Page() {
  return <ClientOnly screen="siteDashboard" />;
}
