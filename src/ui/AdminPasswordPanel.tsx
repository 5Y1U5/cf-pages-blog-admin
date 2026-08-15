"use client";

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

export interface AdminPasswordPanelProps {
  /** 変更するまで閉じられないようにするか（初期パスワード・再発行直後）。 */
  required?: boolean;
  /** 変更が終わったとき。 */
  onDone: () => void;
  /** 閉じたとき。`required` のときは呼ばれない。 */
  onClose?: () => void;
}

export function AdminPasswordPanel({ required = false, onDone, onClose }: AdminPasswordPanelProps) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const tooShort = newPassword.length > 0 && newPassword.length < MIN_LENGTH;
  const mismatch = confirmPassword.length > 0 && newPassword !== confirmPassword;
  const canSubmit =
    currentPassword.length > 0 &&
    newPassword.length >= MIN_LENGTH &&
    newPassword === confirmPassword &&
    !isSubmitting;

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;
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
      const data = (await res.json().catch(() => ({}))) as { message?: string };
      setMessage(data.message || "パスワードを変更できませんでした。");
      return;
    }
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    onDone();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/45 px-4 py-10">
      <div className="w-full max-w-[420px] rounded-lg border border-border bg-background p-5 shadow-lg">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="flex items-center gap-2 text-[15px] font-bold">
              <KeyRound size={16} />
              パスワードの変更
            </p>
            {required ? (
              <p className="mt-2 text-[13px] text-foreground/70">
                いまのパスワードは管理者が発行したものです。受け取るまでの経路に残っているので、
                自分だけが知っているパスワードに変えてください。
              </p>
            ) : null}
          </div>
          {required ? null : (
            <button
              type="button"
              onClick={onClose}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border"
              aria-label="閉じる"
            >
              <X size={16} />
            </button>
          )}
        </div>

        <form onSubmit={submit} className="mt-5">
          <label className="block text-[13px] font-bold">
            現在のパスワード
            <input
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              type="password"
              autoComplete="current-password"
              className="mt-2 h-12 w-full rounded-md border border-border px-3 text-[16px]"
            />
          </label>
          <label className="mt-4 block text-[13px] font-bold">
            新しいパスワード
            <input
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              type="password"
              autoComplete="new-password"
              className="mt-2 h-12 w-full rounded-md border border-border px-3 text-[16px]"
            />
          </label>
          <p className="mt-2 text-[12px] text-foreground/55">
            {MIN_LENGTH}文字以上。空白は使えません。
          </p>
          <label className="mt-4 block text-[13px] font-bold">
            新しいパスワード（確認）
            <input
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              type="password"
              autoComplete="new-password"
              className="mt-2 h-12 w-full rounded-md border border-border px-3 text-[16px]"
            />
          </label>

          {tooShort ? (
            <p className="mt-3 text-[13px] text-red-700">
              新しいパスワードが短すぎます。
            </p>
          ) : null}
          {mismatch ? (
            <p className="mt-3 text-[13px] text-red-700">確認用のパスワードが一致しません。</p>
          ) : null}
          {message ? <p className="mt-3 text-[13px] text-red-700">{message}</p> : null}

          <button
            type="submit"
            disabled={!canSubmit}
            className="mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-foreground text-[15px] font-bold text-background disabled:opacity-40"
          >
            {isSubmitting ? <Loader2 className="animate-spin" size={16} /> : <KeyRound size={16} />}
            {isSubmitting ? "変更中..." : "変更する"}
          </button>
          <p className="mt-3 text-[12px] text-foreground/55">
            変更すると、他の端末で開いているこの管理画面はログインし直しになります。
          </p>
        </form>
      </div>
    </div>
  );
}
