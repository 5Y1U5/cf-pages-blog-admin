import { nowIso, randomId } from "./admin.js";
/** 記録を残す期間。これより古い行はログイン時にまとめて消す。 */
const RETENTION_DAYS = 365;
function clientIp(request) {
    return request.headers.get("cf-connecting-ip") || null;
}
/**
 * 1件記録する。失敗しても例外は投げない。
 *
 * `actor` は認証済みの利用者。自動投稿トークン経由の場合は設定で決めた擬似ユーザーが入る。
 */
export async function recordAudit(db, request, actor, entry) {
    try {
        await db
            .prepare(`INSERT INTO audit_logs
         (id, client_id, actor_id, actor_email, action, target_type, target_id, summary, ip, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
            .bind(randomId("aud"), actor.client_id, actor.id, actor.email || null, entry.action, entry.targetType ?? null, entry.targetId ?? null, entry.summary ?? null, clientIp(request), nowIso())
            .run();
    }
    catch (error) {
        console.warn("audit log was not recorded.", entry.action, error instanceof Error ? error.message : error);
    }
}
/**
 * 保存期間を過ぎた記録を消す。
 * ログインのたびに1回だけ呼ぶ（書き込みのたびに走らせると D1 への往復が倍になるため）。
 */
export async function pruneAuditLogs(db) {
    try {
        const limit = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
        await db.prepare("DELETE FROM audit_logs WHERE created_at < ?").bind(limit).run();
    }
    catch {
        /* テーブルが無いサイトでは何もしない */
    }
}
/** 一覧に出す既定の件数。増やしたくなったら専用のエンドポイントを足すこと。 */
export const AUDIT_LOG_PAGE_SIZE = 50;
/**
 * 直近の記録を読む。テーブルが無ければ空配列を返す（画面は「記録なし」と出るだけで壊れない）。
 */
export async function readRecentAuditLogs(db, clientId, limit = AUDIT_LOG_PAGE_SIZE) {
    try {
        const { results } = await db
            .prepare(`SELECT id, actor_id, actor_email, action, target_type, target_id, summary, ip, created_at
         FROM audit_logs
         WHERE client_id = ?
         ORDER BY created_at DESC
         LIMIT ?`)
            .bind(clientId, limit)
            .all();
        return results ?? [];
    }
    catch (error) {
        console.warn("audit logs could not be read.", error instanceof Error ? error.message : error);
        return [];
    }
}
