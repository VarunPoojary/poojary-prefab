import { AppShell } from "@/components/shell/AppShell";

/** Every route in this group requires a signed-in user and shares the top bar + ☰ menu. */
export default function AppLayout({ children }: LayoutProps<"/">) {
  return <AppShell>{children}</AppShell>;
}
