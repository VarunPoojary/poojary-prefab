"use client";

import dynamic from "next/dynamic";

// Reads the session from browser storage, so it renders on the client only.
const Screen = dynamic(() => import("@/components/auth/ChangePassword").then((m) => m.ForcedPasswordChange), { ssr: false });

export function ChangePasswordClient() {
  return <Screen />;
}
