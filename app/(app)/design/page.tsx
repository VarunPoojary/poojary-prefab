import type { Metadata } from "next";
import { ClientOnly } from "@/components/ClientOnly";

export const metadata: Metadata = { title: "Design · Poojary Prefab" };

export default function Page() {
  return <ClientOnly screen="designDesk" />;
}
