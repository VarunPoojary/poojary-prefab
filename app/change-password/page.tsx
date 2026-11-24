import type { Metadata } from "next";
import { ChangePasswordClient } from "./ChangePasswordClient";

export const metadata: Metadata = { title: "Choose your password · Poojary Prefab" };

export default function ChangePasswordPage() {
  return <ChangePasswordClient />;
}
