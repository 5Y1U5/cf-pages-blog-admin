import { type AdminUser } from "./admin.js";
/**
 * 操作の記録。
 *
 * 記録は本処理の付随物であって、記録できないことを理由に公開やログインを止めない
 * （migration が未適用のサイトでも管理画面は動く必要がある）。
 * 失敗は握り潰さず警告としてログに出し、「記録されていない期間がある」ことに気づけるようにする。
 */
/**
 * 記録する操作の種類。
 * `<対象>.<動作>` の形で揃える。増やすときは UI 側のラベル（AUDIT_ACTION_LABELS）も足すこと。
 */
export type AuditAction = "auth.login" | "auth.logout" | "auth.password_change" | "post.create" | "post.publish" | "post.unpublish" | "post.delete" | "user.create" | "user.update" | "user.delete" | "user.password_reset" | "category.create" | "category.delete" | "asset.upload";
export interface AuditEntry {
    action: AuditAction;
    /** 対象の種類（post / user / category / asset）。ログイン系は省略する。 */
    targetType?: string | null;
    targetId?: string | null;
    /** 一覧に出す短い説明。記事タイトルやメールアドレスなど、後から見て分かる程度に留める。 */
    summary?: string | null;
}
/**
 * 1件記録する。失敗しても例外は投げない。
 *
 * `actor` は認証済みの利用者。自動投稿トークン経由の場合は設定で決めた擬似ユーザーが入る。
 */
export declare function recordAudit(db: D1Database, request: Request, actor: Pick<AdminUser, "id" | "email" | "client_id">, entry: AuditEntry): Promise<void>;
/**
 * 保存期間を過ぎた記録を消す。
 * ログインのたびに1回だけ呼ぶ（書き込みのたびに走らせると D1 への往復が倍になるため）。
 */
export declare function pruneAuditLogs(db: D1Database): Promise<void>;
export interface AuditLogRow {
    id: string;
    actor_id: string;
    actor_email: string | null;
    action: string;
    target_type: string | null;
    target_id: string | null;
    summary: string | null;
    ip: string | null;
    created_at: string;
}
/** 一覧に出す既定の件数。増やしたくなったら専用のエンドポイントを足すこと。 */
export declare const AUDIT_LOG_PAGE_SIZE = 50;
/**
 * 直近の記録を読む。テーブルが無ければ空配列を返す（画面は「記録なし」と出るだけで壊れない）。
 */
export declare function readRecentAuditLogs(db: D1Database, clientId: string, limit?: number): Promise<AuditLogRow[]>;
