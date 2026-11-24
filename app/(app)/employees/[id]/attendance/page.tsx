import type { Metadata } from "next";
import { ClientOnly } from "@/components/ClientOnly";

export const metadata: Metadata = { title: "Employee attendance · Poojary Prefab" };

export default function Page() {
  return <ClientOnly screen="employeeAttendance" />;
}
