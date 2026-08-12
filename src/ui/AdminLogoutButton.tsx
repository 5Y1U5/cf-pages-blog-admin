"use client";

import { useState } from "react";
import { Loader2, LogOut } from "lucide-react";

import { cn } from "./cn.js";
import { ADMIN_API, ADMIN_PATHS } from "./paths.js";

export interface AdminLogoutButtonProps {
  className?: string;
  label?: string;
}

export function AdminLogoutButton({
  className,
  label = "ログアウト",
}: AdminLogoutButtonProps) {
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  async function logout() {
    setIsLoggingOut(true);
    await fetch(ADMIN_API.logout, { method: "POST" }).catch(() => undefined);
    location.href = ADMIN_PATHS.login;
  }

  return (
    <button
      type="button"
      onClick={() => void logout()}
      disabled={isLoggingOut}
      className={cn(
        "flex h-11 w-11 items-center justify-center rounded-lg border border-border bg-background disabled:opacity-50",
        className
      )}
      aria-label={label}
      title={label}
    >
      {isLoggingOut ? <Loader2 className="animate-spin" size={18} /> : <LogOut size={18} />}
    </button>
  );
}
