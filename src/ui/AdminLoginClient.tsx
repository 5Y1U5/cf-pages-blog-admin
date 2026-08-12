"use client";

import { useState } from "react";
import { LogIn } from "lucide-react";

import type { BlogAdminConfig } from "../config/index.js";
import { ADMIN_API, ADMIN_PATHS } from "./paths.js";

export interface AdminLoginClientProps {
  config: BlogAdminConfig;
}

export function AdminLoginClient({ config }: AdminLoginClientProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
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
    const data = (await res.json().catch(() => ({}))) as { message?: string };
    setMessage(
      data.message || "ログインできませんでした。メールアドレスとパスワードを確認してください。"
    );
    setIsSubmitting(false);
  }

  return (
    <main className="min-h-screen bg-[rgb(247,247,247)] px-5 py-8">
      <div className="mx-auto max-w-[420px]">
        <p className="text-[12px] font-bold tracking-[0.28em] text-foreground/50">
          {config.brandLabel}
        </p>
        <h1 className="mt-3 text-[28px] font-bold leading-tight">ログイン</h1>
        <form onSubmit={submit} className="mt-8 rounded-lg border border-border bg-background p-5">
          <label className="block text-[13px] font-bold">
            メールアドレス
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              autoComplete="email"
              className="mt-2 h-12 w-full rounded-md border border-border px-3 text-[16px]"
            />
          </label>
          <label className="mt-5 block text-[13px] font-bold">
            パスワード
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              autoComplete="current-password"
              className="mt-2 h-12 w-full rounded-md border border-border px-3 text-[16px]"
            />
          </label>
          {message ? <p className="mt-4 text-[13px] text-red-700">{message}</p> : null}
          <button
            type="submit"
            disabled={isSubmitting}
            className="mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-foreground text-[15px] font-bold text-background disabled:opacity-50"
          >
            <LogIn size={18} />
            {isSubmitting ? "確認中..." : "ログイン"}
          </button>
        </form>
      </div>
    </main>
  );
}
