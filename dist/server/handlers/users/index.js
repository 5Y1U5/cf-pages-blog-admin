import { badRequest, hashPassword, json, normalizeString, nowIso, randomId, readJson, requireDb, requireUser, } from "../../_shared/admin.js";
import { generateInitialPassword, isValidEmail } from "./password.js";
const ROLES = new Set(["admin", "client_publisher", "client_viewer"]);
function nameFromEmail(email) {
    return email.split("@")[0] || email;
}
export function createUsersHandlers(config) {
    const onRequestGet = async (ctx) => {
        const user = await requireUser(ctx.request, ctx.env, config, ["admin"]);
        if (user instanceof Response)
            return user;
        const db = requireDb(ctx.env);
        if (db instanceof Response)
            return db;
        // パスワードハッシュは返さない（一覧に必要な列だけを選ぶ）。
        const { results } = await db
            .prepare(`SELECT id, email, name, role, client_id, is_active, created_at, updated_at
         FROM users
         WHERE client_id = ?
         ORDER BY role ASC, email ASC`)
            .bind(user.client_id)
            .all();
        return json({ ok: true, users: results });
    };
    const onRequestPost = async (ctx) => {
        const currentUser = await requireUser(ctx.request, ctx.env, config, ["admin"]);
        if (currentUser instanceof Response)
            return currentUser;
        const db = requireDb(ctx.env);
        if (db instanceof Response)
            return db;
        const payload = await readJson(ctx.request);
        if (payload instanceof Response)
            return payload;
        const email = normalizeString(payload.email).toLowerCase();
        const name = normalizeString(payload.name) || nameFromEmail(email);
        const role = payload.role || "client_publisher";
        if (!email || !isValidEmail(email)) {
            return badRequest("有効なメールアドレスを入力してください。");
        }
        if (!ROLES.has(role))
            return badRequest("ユーザー権限を選択してください。");
        const existing = await db
            .prepare("SELECT id FROM users WHERE email = ? LIMIT 1")
            .bind(email)
            .first();
        if (existing) {
            return json({
                ok: false,
                error: "already_exists",
                message: "このメールアドレスはすでに登録されています。",
            }, { status: 409 });
        }
        // 初期パスワードは平文で保存しない。この応答で1度だけ返し、DB にはハッシュのみ入れる。
        const initialPassword = generateInitialPassword();
        const passwordHash = await hashPassword(initialPassword);
        const now = nowIso();
        const id = randomId("usr");
        await db
            .prepare(`INSERT INTO users
         (id, email, name, role, client_id, password_hash, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
            .bind(id, email, name, role, currentUser.client_id, passwordHash, now, now)
            .run();
        return json({
            ok: true,
            user: {
                id,
                email,
                name,
                role,
                client_id: currentUser.client_id,
                created_at: now,
                updated_at: now,
            },
            initialPassword,
        }, { status: 201 });
    };
    return { onRequestGet, onRequestPost };
}
