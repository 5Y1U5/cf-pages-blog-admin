"use client";
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { KeyRound, Loader2, X } from "lucide-react";
import { userApi } from "./paths.js";
/**
 * 本人によるパスワード変更。
 *
 * 管理者が発行した初期パスワード・再発行パスワードは、本人に渡すまでの経路（チャットやメール）に
 * 平文が残る。受け取った本人が自分のパスワードに変えるまでが1セットで、
 * `required` のときは閉じられないようにして、そこまでを促す。
 */
/** サーバー側の最低文字数と合わせる（判定の正はサーバー）。 */
const MIN_LENGTH = 12;
export function AdminPasswordPanel({ required = false, onDone, onClose }) {
    const [currentPassword, setCurrentPassword] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [message, setMessage] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const tooShort = newPassword.length > 0 && newPassword.length < MIN_LENGTH;
    const mismatch = confirmPassword.length > 0 && newPassword !== confirmPassword;
    const canSubmit = currentPassword.length > 0 &&
        newPassword.length >= MIN_LENGTH &&
        newPassword === confirmPassword &&
        !isSubmitting;
    async function submit(event) {
        event.preventDefault();
        if (!canSubmit)
            return;
        setIsSubmitting(true);
        setMessage("");
        const res = await fetch(userApi("me"), {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ currentPassword, newPassword }),
        }).catch(() => null);
        setIsSubmitting(false);
        if (!res) {
            setMessage("通信できませんでした。時間をおいて再度お試しください。");
            return;
        }
        if (!res.ok) {
            const data = (await res.json().catch(() => ({})));
            setMessage(data.message || "パスワードを変更できませんでした。");
            return;
        }
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
        onDone();
    }
    return (_jsx("div", { className: "fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/45 px-4 py-10", children: _jsxs("div", { className: "w-full max-w-[420px] rounded-lg border border-border bg-background p-5 shadow-lg", children: [_jsxs("div", { className: "flex items-start justify-between gap-3", children: [_jsxs("div", { children: [_jsxs("p", { className: "flex items-center gap-2 text-[15px] font-bold", children: [_jsx(KeyRound, { size: 16 }), "\u30D1\u30B9\u30EF\u30FC\u30C9\u306E\u5909\u66F4"] }), required ? (_jsx("p", { className: "mt-2 text-[13px] text-foreground/70", children: "\u3044\u307E\u306E\u30D1\u30B9\u30EF\u30FC\u30C9\u306F\u7BA1\u7406\u8005\u304C\u767A\u884C\u3057\u305F\u3082\u306E\u3067\u3059\u3002\u53D7\u3051\u53D6\u308B\u307E\u3067\u306E\u7D4C\u8DEF\u306B\u6B8B\u3063\u3066\u3044\u308B\u306E\u3067\u3001 \u81EA\u5206\u3060\u3051\u304C\u77E5\u3063\u3066\u3044\u308B\u30D1\u30B9\u30EF\u30FC\u30C9\u306B\u5909\u3048\u3066\u304F\u3060\u3055\u3044\u3002" })) : null] }), required ? null : (_jsx("button", { type: "button", onClick: onClose, className: "flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border", "aria-label": "\u9589\u3058\u308B", children: _jsx(X, { size: 16 }) }))] }), _jsxs("form", { onSubmit: submit, className: "mt-5", children: [_jsxs("label", { className: "block text-[13px] font-bold", children: ["\u73FE\u5728\u306E\u30D1\u30B9\u30EF\u30FC\u30C9", _jsx("input", { value: currentPassword, onChange: (event) => setCurrentPassword(event.target.value), type: "password", autoComplete: "current-password", className: "mt-2 h-12 w-full rounded-md border border-border px-3 text-[16px]" })] }), _jsxs("label", { className: "mt-4 block text-[13px] font-bold", children: ["\u65B0\u3057\u3044\u30D1\u30B9\u30EF\u30FC\u30C9", _jsx("input", { value: newPassword, onChange: (event) => setNewPassword(event.target.value), type: "password", autoComplete: "new-password", className: "mt-2 h-12 w-full rounded-md border border-border px-3 text-[16px]" })] }), _jsxs("p", { className: "mt-2 text-[12px] text-foreground/55", children: [MIN_LENGTH, "\u6587\u5B57\u4EE5\u4E0A\u3002\u7A7A\u767D\u306F\u4F7F\u3048\u307E\u305B\u3093\u3002"] }), _jsxs("label", { className: "mt-4 block text-[13px] font-bold", children: ["\u65B0\u3057\u3044\u30D1\u30B9\u30EF\u30FC\u30C9\uFF08\u78BA\u8A8D\uFF09", _jsx("input", { value: confirmPassword, onChange: (event) => setConfirmPassword(event.target.value), type: "password", autoComplete: "new-password", className: "mt-2 h-12 w-full rounded-md border border-border px-3 text-[16px]" })] }), tooShort ? (_jsx("p", { className: "mt-3 text-[13px] text-red-700", children: "\u65B0\u3057\u3044\u30D1\u30B9\u30EF\u30FC\u30C9\u304C\u77ED\u3059\u304E\u307E\u3059\u3002" })) : null, mismatch ? (_jsx("p", { className: "mt-3 text-[13px] text-red-700", children: "\u78BA\u8A8D\u7528\u306E\u30D1\u30B9\u30EF\u30FC\u30C9\u304C\u4E00\u81F4\u3057\u307E\u305B\u3093\u3002" })) : null, message ? _jsx("p", { className: "mt-3 text-[13px] text-red-700", children: message }) : null, _jsxs("button", { type: "submit", disabled: !canSubmit, className: "mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-foreground text-[15px] font-bold text-background disabled:opacity-40", children: [isSubmitting ? _jsx(Loader2, { className: "animate-spin", size: 16 }) : _jsx(KeyRound, { size: 16 }), isSubmitting ? "変更中..." : "変更する"] }), _jsx("p", { className: "mt-3 text-[12px] text-foreground/55", children: "\u5909\u66F4\u3059\u308B\u3068\u3001\u4ED6\u306E\u7AEF\u672B\u3067\u958B\u3044\u3066\u3044\u308B\u3053\u306E\u7BA1\u7406\u753B\u9762\u306F\u30ED\u30B0\u30A4\u30F3\u3057\u76F4\u3057\u306B\u306A\u308A\u307E\u3059\u3002" })] })] }) }));
}
