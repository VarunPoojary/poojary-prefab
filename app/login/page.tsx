import type { Metadata } from "next";
import { LoginClient } from "./LoginClient";

export const metadata: Metadata = { title: "Sign in · Poojary Prefab" };

export default function LoginPage() {
  return <LoginClient />;
}
