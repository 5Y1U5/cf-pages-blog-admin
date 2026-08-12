import type { AdminRole, BlogAdminConfig } from "../../config/index.js";
import type { BlogAdminEnv } from "../../config/env.js";
export type { BlogAdminEnv };
export interface AdminUser {
    id: string;
    email: string;
    name: string;
    role: AdminRole;
    client_id: string;
}
export declare const JSON_HEADERS: {
    "Content-Type": string;
    "Cache-Control": string;
};
export declare function json(data: unknown, init?: ResponseInit): Response;
export declare function badRequest(message: string): Response;
export declare function unauthorized(): Response;
export declare function forbidden(): Response;
export declare function serverError(message: string): Response;
export declare function requireDb(env: BlogAdminEnv): D1Database | Response;
export declare function readJson<T>(request: Request): Promise<T | Response>;
export declare function nowIso(): string;
export declare function randomId(prefix: string): string;
export declare function isValidSlug(slug: string): boolean;
export declare function parseCookies(request: Request): Record<string, string>;
export declare function sha256Hex(input: string): Promise<string>;
/**
 * PBKDF2 の反復回数。
 * ハッシュ文字列に `pbkdf2$<iterations>$...` の形で埋め込み、検証側は保存値から反復回数を読む。
 * そのためここを変更しても既存ユーザーのログインは壊れない（再設定時に新しい値へ入れ替わる）。
 * Workers ランタイムは PBKDF2 の反復回数に上限があるため、引き上げる場合は実環境で
 * ログインとユーザー作成が通ることを確認してから変えること。
 */
export declare const PBKDF2_ITERATIONS = 100000;
export declare function hashPassword(password: string): Promise<string>;
export declare function verifyPassword(password: string, passwordHash: string | null): Promise<boolean>;
export declare function getSessionUser(request: Request, env: BlogAdminEnv, config: BlogAdminConfig): Promise<AdminUser | Response>;
export declare function requireUser(request: Request, env: BlogAdminEnv, config: BlogAdminConfig, roles?: AdminRole[]): Promise<AdminUser | Response>;
export declare function sessionCookie(config: BlogAdminConfig, token: string, expires: Date): string;
export declare function clearSessionCookie(config: BlogAdminConfig): string;
export declare function normalizeString(value: unknown): string;
