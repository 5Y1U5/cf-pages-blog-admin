import { badRequest, json, normalizeString, randomId, readJson, requireDb, sessionCookie, sha256Hex, verifyPassword, } from "../../_shared/admin.js";
// ログイン総当たり対策：同一メールが ATTEMPT_WINDOW 内に MAX_FAILED 回失敗したら一時ロック。
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILED_ATTEMPTS = 5;
// 同一 IP からメールアドレスを次々に変えて試す攻撃（パスワードスプレー）対策。
// メール単位より緩くしているのは、共有回線（NAT）だと複数人の入力ミスが同じ IP に
// 合算されるため。「数人がそれぞれ数回打ち間違える」程度は通し、それを明らかに超える
// 機械的な試行だけを止める線として 15分あたり20回とする。
const MAX_FAILED_ATTEMPTS_PER_IP = 20;
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;
// login_attempts テーブルが未作成（migration 未適用）でもログイン自体は止めない（可用性優先で素通り）。
// 素通りしたことに気づけるよう、失敗時は警告としてログに残す。
// メール単位と IP 単位は1クエリでまとめて数える（D1 への往復を増やさないため）。
async function recentFailedAttempts(db, email, ip) {
    try {
        const windowStart = new Date(Date.now() - ATTEMPT_WINDOW_MS).toISOString();
        const row = await db
            .prepare(`SELECT
           SUM(CASE WHEN email = ? THEN 1 ELSE 0 END) AS by_email,
           SUM(CASE WHEN ip = ? THEN 1 ELSE 0 END) AS by_ip
         FROM login_attempts
         WHERE created_at > ?`)
            .bind(email, ip, windowStart)
            .first();
        return { byEmail: Number(row?.by_email ?? 0), byIp: Number(row?.by_ip ?? 0) };
    }
    catch (error) {
        console.warn("login throttling is disabled: could not read login_attempts.", error instanceof Error ? error.message : error);
        return { byEmail: 0, byIp: 0 };
    }
}
async function recordFailedAttempt(db, email, ip) {
    try {
        await db
            .prepare("INSERT INTO login_attempts (id, email, ip, created_at) VALUES (?, ?, ?, ?)")
            .bind(randomId("la"), email, ip || null, new Date().toISOString())
            .run();
        // ウィンドウ外の古い記録を掃除（無制限な増加を防ぐ）。
        const windowStart = new Date(Date.now() - ATTEMPT_WINDOW_MS).toISOString();
        await db.prepare("DELETE FROM login_attempts WHERE created_at < ?").bind(windowStart).run();
    }
    catch (error) {
        console.warn("login throttling is disabled: could not write login_attempts.", error instanceof Error ? error.message : error);
    }
}
// 成功時に消すのはメール単位の記録だけ。IP 単位まで消すと、正規のアカウントを1つ持つ攻撃者が
// ログインし直すたびに IP のカウンタを空にできてしまい、スプレー対策として機能しなくなる。
async function clearFailedAttempts(db, email) {
    try {
        await db.prepare("DELETE FROM login_attempts WHERE email = ?").bind(email).run();
    }
    catch {
        /* 記録用テーブルが無い場合は何もしない */
    }
}
export function createLoginHandlers(config) {
    const onRequestPost = async (ctx) => {
        const db = requireDb(ctx.env);
        if (db instanceof Response)
            return db;
        const payload = await readJson(ctx.request);
        if (payload instanceof Response)
            return payload;
        const email = normalizeString(payload.email).toLowerCase();
        const password = normalizeString(payload.password);
        if (!email || !password)
            return badRequest("email and password are required.");
        const ip = ctx.request.headers.get("cf-connecting-ip") || "";
        const failures = await recentFailedAttempts(db, email, ip);
        // IP 単位は CF-Connecting-IP が取れたときだけ判定する。ローカル開発など Cloudflare を
        // 経由しない実行ではヘッダが無いため、その場合はメール単位の制限だけを効かせる。
        const ipThrottled = ip !== "" && failures.byIp >= MAX_FAILED_ATTEMPTS_PER_IP;
        // メール起因か IP 起因かは返さない（どちらで止まったかを攻撃者に推測させないため）。
        if (failures.byEmail >= MAX_FAILED_ATTEMPTS || ipThrottled) {
            return json({
                ok: false,
                error: "too_many_attempts",
                message: "ログインの失敗が続いたため一時的にロックされています。約15分後に再度お試しください。",
            }, { status: 429 });
        }
        const user = await db
            .prepare(`SELECT id, email, name, role, client_id, password_hash, is_active
         FROM users
         WHERE email = ?
         LIMIT 1`)
            .bind(email)
            .first();
        if (!user || !(await verifyPassword(password, user.password_hash))) {
            await recordFailedAttempt(db, email, ip);
            return json({ ok: false, error: "invalid_credentials" }, { status: 401 });
        }
        if (user.is_active === 0) {
            return json({
                ok: false,
                error: "account_disabled",
                message: "このアカウントは無効化されています。管理者にお問い合わせください。",
            }, { status: 403 });
        }
        await clearFailedAttempts(db, email);
        const token = crypto.randomUUID() + crypto.randomUUID();
        const tokenHash = await sha256Hex(token);
        const expires = new Date(Date.now() + SESSION_TTL_MS);
        await db
            .prepare(`INSERT INTO sessions (id, user_id, token_hash, expires_at, created_at)
         VALUES (?, ?, ?, ?, ?)`)
            .bind(randomId("ses"), user.id, tokenHash, expires.toISOString(), new Date().toISOString())
            .run();
        return json({
            ok: true,
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                role: user.role,
                clientId: user.client_id,
            },
        }, { headers: { "Set-Cookie": sessionCookie(config, token, expires) } });
    };
    return { onRequestPost };
}
