import type { AdminRole, BlogAdminConfig } from "../../config/index.js";
import type { BlogAdminEnv } from "../../config/env.js";

export type { BlogAdminEnv };

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: AdminRole;
  client_id: string;
  /**
   * 管理者が発行したパスワードのままかどうか。1 のあいだは本人が変えるまで
   * パスワード変更と自分の情報の取得以外を通さない（`requireUser` が止める）。
   * migration 0006 が未適用のサイトでは常に 0 になる。
   */
  must_change_password: number;
}

export const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
};

export function json(data: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { ...JSON_HEADERS, ...(init.headers || {}) },
  });
}

export function badRequest(message: string): Response {
  return json({ ok: false, error: "bad_request", message }, { status: 400 });
}

export function unauthorized(): Response {
  return json({ ok: false, error: "unauthorized" }, { status: 401 });
}

export function forbidden(): Response {
  return json({ ok: false, error: "forbidden" }, { status: 403 });
}

export function serverError(message: string): Response {
  return json({ ok: false, error: "server_error", message }, { status: 500 });
}

export function requireDb(env: BlogAdminEnv): D1Database | Response {
  if (!env.ADMIN_DB) {
    return serverError("ADMIN_DB binding is not configured.");
  }
  return env.ADMIN_DB;
}

export async function readJson<T>(request: Request): Promise<T | Response> {
  try {
    return (await request.json()) as T;
  } catch {
    return badRequest("Invalid JSON body.");
  }
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function randomId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replaceAll("-", "")}`;
}

export function isValidSlug(slug: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug);
}

export function parseCookies(request: Request): Record<string, string> {
  const cookie = request.headers.get("Cookie") || "";
  const out: Record<string, string> = {};
  for (const part of cookie.split(";")) {
    const [rawKey, ...rawValue] = part.trim().split("=");
    if (!rawKey) continue;
    out[rawKey] = decodeURIComponent(rawValue.join("="));
  }
  return out;
}

export async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * PBKDF2 の反復回数。
 * ハッシュ文字列に `pbkdf2$<iterations>$...` の形で埋め込み、検証側は保存値から反復回数を読む。
 * そのためここを変更しても既存ユーザーのログインは壊れない（再設定時に新しい値へ入れ替わる）。
 * Workers ランタイムは PBKDF2 の反復回数に上限があるため、引き上げる場合は実環境で
 * ログインとユーザー作成が通ることを確認してから変えること。
 */
export const PBKDF2_ITERATIONS = 100_000;

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iterations = PBKDF2_ITERATIONS;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    key,
    256
  );
  return `pbkdf2$${iterations}$${bytesToBase64(salt)}$${bytesToBase64(
    new Uint8Array(bits)
  )}`;
}

export async function verifyPassword(
  password: string,
  passwordHash: string | null
): Promise<boolean> {
  if (!passwordHash) return false;
  const [kind, iterationsRaw, saltRaw, hashRaw] = passwordHash.split("$");
  if (kind !== "pbkdf2" || !iterationsRaw || !saltRaw || !hashRaw) return false;

  const iterations = Number(iterationsRaw);
  if (!Number.isSafeInteger(iterations) || iterations < 10_000) return false;

  const salt = base64ToBytes(saltRaw);
  const expected = base64ToBytes(hashRaw);
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    key,
    expected.length * 8
  );
  const actual = new Uint8Array(bits);
  if (actual.length !== expected.length) return false;

  let diff = 0;
  for (let i = 0; i < actual.length; i += 1) {
    diff |= actual[i] ^ expected[i];
  }
  return diff === 0;
}

// __Host- プレフィクス付き Cookie：Secure・Path=/・Domain 無し が必須で、サブドメインからの
// Cookie 上書き（cookie injection）を防げる。本番は HTTPS なので利用可能。
// Cookie 名は設定の1か所だけで定義し、login / logout / 検証はすべてそれを参照する。

function sessionUserSelect(withPasswordFlag: boolean): string {
  const flag = withPasswordFlag ? ", users.must_change_password" : "";
  return `SELECT users.id, users.email, users.name, users.role, users.client_id${flag}
       FROM sessions
       INNER JOIN users ON users.id = sessions.user_id
       WHERE sessions.token_hash = ? AND sessions.expires_at > ?
         AND users.is_active = 1
       LIMIT 1`;
}

export async function getSessionUser(
  request: Request,
  env: BlogAdminEnv,
  config: BlogAdminConfig
): Promise<AdminUser | Response> {
  const db = requireDb(env);
  if (db instanceof Response) return db;

  const token = parseCookies(request)[config.sessionCookieName];
  if (!token) return unauthorized();

  const tokenHash = await sha256Hex(token);
  const now = nowIso();

  // must_change_password は migration 0006 で足した列。未適用のサイトでこの SELECT が
  // 落ちると管理画面が丸ごと使えなくなるため、失敗したら列を外して引き直す。
  // その場合は「変更を促さない」という 0006 以前の挙動になるだけで、認証は通る。
  let user: AdminUser | null = null;
  try {
    user = await db
      .prepare(sessionUserSelect(true))
      .bind(tokenHash, now)
      .first<AdminUser>();
  } catch (error) {
    console.warn(
      "must_change_password was not read (migration 0006 may be missing).",
      error instanceof Error ? error.message : error
    );
    const fallback = await db
      .prepare(sessionUserSelect(false))
      .bind(tokenHash, now)
      .first<Omit<AdminUser, "must_change_password">>();
    user = fallback ? { ...fallback, must_change_password: 0 } : null;
  }

  if (!user) return unauthorized();
  return user;
}

/**
 * ブラウザを介さない書き込み用の Bearer トークン認証。
 *
 * `automation.tokenEnvVar` が未指定、または指し先の環境変数が未設定・短すぎるときは
 * 常に不成立にする（設定を入れるまでこの経路は開かない）。
 * 比較は一致・不一致にかかわらず同じ回数を回し、応答時間から答えが漏れないようにする。
 */
function automationUser(
  request: Request,
  env: BlogAdminEnv,
  config: BlogAdminConfig
): AdminUser | null {
  const { tokenEnvVar } = config.automation;
  if (!tokenEnvVar) return null;

  const expected = (env as unknown as Record<string, unknown>)[tokenEnvVar];
  if (typeof expected !== "string" || expected.length < 32) return null;

  const header = request.headers.get("Authorization") || "";
  const presented = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (presented.length !== expected.length) return null;

  let diff = 0;
  for (let i = 0; i < expected.length; i += 1) {
    diff |= presented.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  if (diff !== 0) return null;

  return {
    id: config.automation.user.id,
    email: config.automation.user.email,
    name: config.automation.user.name,
    role: config.automation.role,
    client_id: config.clientId,
    // トークンは users に実在しない利用者なので、変更を促す対象にならない。
    must_change_password: 0,
  };
}

export interface RequireUserOptions {
  /**
   * `must_change_password` が立っていても通すか。
   * パスワード変更そのものと、自分の状態を取得する経路だけが true になる。
   */
  allowPasswordChangePending?: boolean;
}

export function passwordChangeRequired(): Response {
  return json(
    {
      ok: false,
      error: "password_change_required",
      message:
        "管理者が発行したパスワードのままです。パスワードを変更してから操作してください。",
    },
    { status: 403 }
  );
}

export async function requireUser(
  request: Request,
  env: BlogAdminEnv,
  config: BlogAdminConfig,
  roles?: AdminRole[],
  options?: RequireUserOptions
): Promise<AdminUser | Response> {
  const machine = automationUser(request, env, config);
  if (machine) {
    if (roles && !roles.includes(machine.role)) return forbidden();
    return machine;
  }

  const user = await getSessionUser(request, env, config);
  if (user instanceof Response) return user;
  if (roles && !roles.includes(user.role)) return forbidden();
  // 発行されたままのパスワードでは、変更以外の操作をさせない。
  // 画面を出さないだけでは、API を直接叩けば素通りしてしまうためここで止める。
  if (!options?.allowPasswordChangePending && user.must_change_password === 1) {
    return passwordChangeRequired();
  }
  return user;
}

export function sessionCookie(
  config: BlogAdminConfig,
  token: string,
  expires: Date
): string {
  return [
    `${config.sessionCookieName}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    `Expires=${expires.toUTCString()}`,
  ].join("; ");
}

export function clearSessionCookie(config: BlogAdminConfig): string {
  return [
    `${config.sessionCookieName}=`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    "Max-Age=0",
  ].join("; ");
}

export function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
