"use client";

import dynamic from "next/dynamic";

// Reads the session from browser storage, so it renders on the client only.
const LoginScreen = dynamic(() => import("@/components/auth/LoginScreen").then((m) => m.LoginScreen), { ssr: false });

export function LoginClient() {
  return <LoginScreen />;
}
