"use client";
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { LogIn } from "lucide-react";
import { ADMIN_API, ADMIN_PATHS } from "./paths.js";
export function AdminLoginClient({ config }) {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [message, setMessage] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);
    async function submit(event) {
        event.preventDefault();
        setIsSubmitting(true);
        setMessage("");
        const res = await fetch(ADMIN_API.login, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password }),
        });
        if (res.ok) {
            location.href = ADMIN_PATHS.posts;
            return;
        }
        // 429（試行回数超過）・403（アカウント無効化）はサーバーが理由を日本語で返すので、
        // それがあれば固定文言より優先して見せる。
        const data = (await res.json().catch(() => ({})));
        setMessage(data.message || "ログインできませんでした。メールアドレスとパスワードを確認してください。");
        setIsSubmitting(false);
    }
    return (_jsx("main", { className: "min-h-screen bg-[rgb(247,247,247)] px-5 py-8", children: _jsxs("div", { className: "mx-auto max-w-[420px]", children: [_jsx("p", { className: "text-[12px] font-bold tracking-[0.28em] text-foreground/50", children: config.brandLabel }), _jsx("h1", { className: "mt-3 text-[28px] font-bold leading-tight", children: "\u30ED\u30B0\u30A4\u30F3" }), _jsxs("form", { onSubmit: submit, className: "mt-8 rounded-lg border border-border bg-background p-5", children: [_jsxs("label", { className: "block text-[13px] font-bold", children: ["\u30E1\u30FC\u30EB\u30A2\u30C9\u30EC\u30B9", _jsx("input", { value: email, onChange: (e) => setEmail(e.target.value), type: "email", autoComplete: "email", className: "mt-2 h-12 w-full rounded-md border border-border px-3 text-[16px]" })] }), _jsxs("label", { className: "mt-5 block text-[13px] font-bold", children: ["\u30D1\u30B9\u30EF\u30FC\u30C9", _jsx("input", { value: password, onChange: (e) => setPassword(e.target.value), type: "password", autoComplete: "current-password", className: "mt-2 h-12 w-full rounded-md border border-border px-3 text-[16px]" })] }), message ? _jsx("p", { className: "mt-4 text-[13px] text-red-700", children: message }) : null, _jsxs("button", { type: "submit", disabled: isSubmitting, className: "mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-foreground text-[15px] font-bold text-background disabled:opacity-50", children: [_jsx(LogIn, { size: 18 }), isSubmitting ? "確認中..." : "ログイン"] })] })] }) }));
}
