"use client";
import { jsx as _jsx } from "react/jsx-runtime";
import { useState } from "react";
import { Loader2, LogOut } from "lucide-react";
import { cn } from "./cn.js";
import { ADMIN_API, ADMIN_PATHS } from "./paths.js";
export function AdminLogoutButton({ className, label = "ログアウト", }) {
    const [isLoggingOut, setIsLoggingOut] = useState(false);
    async function logout() {
        setIsLoggingOut(true);
        await fetch(ADMIN_API.logout, { method: "POST" }).catch(() => undefined);
        location.href = ADMIN_PATHS.login;
    }
    return (_jsx("button", { type: "button", onClick: () => void logout(), disabled: isLoggingOut, className: cn("flex h-11 w-11 items-center justify-center rounded-lg border border-border bg-background disabled:opacity-50", className), "aria-label": label, title: label, children: isLoggingOut ? _jsx(Loader2, { className: "animate-spin", size: 18 }) : _jsx(LogOut, { size: 18 }) }));
}
