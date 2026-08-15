import { badRequest, forbidden, hashPassword, json, normalizeString, nowIso, parseCookies, readJson, requireDb, requireUser, sha256Hex, unauthorized, verifyPassword, } from "../../_shared/admin.js";
import { recordAudit } from "../../_shared/audit.js";
import { generateInitialPassword, setMustChangePassword, validateNewPassword, } from "./password.js";
const ROLES = new Set(["admin", "client_publisher", "client_viewer"]);
/**
 * 自分自身を指す ID。`PUT /api/admin/users/me` が本人のパスワード変更になる。
 *
 * 専用のエンドポイントを足さないのは、導入先の `functions/api/admin/**` に再 export の
 * ファイルを1枚増やす作業が発生し、Renovate の更新 PR ではそれが配れないため。
 * 既存のルートに載せておけば、パッケージを上げるだけで全サイトに届く。
 * 実在のユーザー ID は `usr_` で始まるので `me` と衝突しない。
 */
const SELF_ID = "me";
function loadTarget(db, clientId, id) {
    return db
        .prepare("SELECT id, email, name, role, is_active FROM users WHERE id = ? AND client_id = ? LIMIT 1")
        .bind(id, clientId)
        .first();
}
// 自分以外で有効な管理者が何人いるか（最後の管理者を失わないための判定に使う）。
async function otherActiveAdminCount(db, clientId, excludeId) {
    const row = await db
        .prepare("SELECT COUNT(*) AS c FROM users WHERE client_id = ? AND role = 'admin' AND is_active = 1 AND id <> ?")
        .bind(clientId, excludeId)
        .first();
    return Number(row?.c ?? 0);
}
export function createUserDetailHandlers(config) {
    /**
     * 本人によるパスワード変更。権限を問わず自分の分だけ変えられる。
     *
     * 現在のパスワードを必須にしているのは、席を外した端末で第三者が黙って
     * パスワードを差し替え、本人を締め出すのを防ぐため。
     * 試行回数の制限はログイン側だけに置く（ここに到達するには有効なセッションが要る）。
     */
    const changeOwnPassword = async (ctx) => {
        // 変更が必要な状態のまま塞がれると変更もできなくなるので、この経路だけは通す。
        const user = await requireUser(ctx.request, ctx.env, config, undefined, {
            allowPasswordChangePending: true,
        });
        if (user instanceof Response)
            return user;
        const db = requireDb(ctx.env);
        if (db instanceof Response)
            return db;
        // 自動投稿トークンで来た場合、その利用者は users に実在しないので変更しようがない。
        if (user.id === config.automation.user.id) {
            return forbidden();
        }
        const payload = await readJson(ctx.request);
        if (payload instanceof Response)
            return payload;
        const currentPassword = typeof payload.currentPassword === "string" ? payload.currentPassword : "";
        const newPassword = typeof payload.newPassword === "string" ? payload.newPassword : "";
        if (!currentPassword || !newPassword) {
            return badRequest("現在のパスワードと新しいパスワードを入力してください。");
        }
        const invalid = validateNewPassword(newPassword);
        if (invalid)
            return badRequest(invalid);
        if (newPassword === currentPassword) {
            return badRequest("いまと違うパスワードにしてください。");
        }
        const row = await db
            .prepare("SELECT password_hash FROM users WHERE id = ? AND client_id = ? LIMIT 1")
            .bind(user.id, user.client_id)
            .first();
        if (!row)
            return unauthorized();
        if (!(await verifyPassword(currentPassword, row.password_hash))) {
            return badRequest("現在のパスワードが違います。");
        }
        const now = nowIso();
        await db
            .prepare("UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ? AND client_id = ?")
            .bind(await hashPassword(newPassword), now, user.id, user.client_id)
            .run();
        await setMustChangePassword(db, user.id, false);
        // 自分の他のセッションだけ失効させる。いま操作している画面はそのまま使えるようにする
        // （変更のたびにログインし直しになると、変更そのものが敬遠される）。
        const token = parseCookies(ctx.request)[config.sessionCookieName];
        if (token) {
            await db
                .prepare("DELETE FROM sessions WHERE user_id = ? AND token_hash <> ?")
                .bind(user.id, await sha256Hex(token))
                .run();
        }
        await recordAudit(db, ctx.request, user, {
            action: "auth.password_change",
            targetType: "user",
            targetId: user.id,
            summary: user.email,
        });
        return json({ ok: true, mustChangePassword: false });
    };
    const onRequestPut = async (ctx) => {
        if (String(ctx.params.id) === SELF_ID)
            return changeOwnPassword(ctx);
        const currentUser = await requireUser(ctx.request, ctx.env, config, ["admin"]);
        if (currentUser instanceof Response)
            return currentUser;
        const db = requireDb(ctx.env);
        if (db instanceof Response)
            return db;
        const target = await loadTarget(db, currentUser.client_id, String(ctx.params.id));
        if (!target)
            return json({ ok: false, error: "not_found" }, { status: 404 });
        const payload = await readJson(ctx.request);
        if (payload instanceof Response)
            return payload;
        const name = payload.name !== undefined ? normalizeString(payload.name) || target.name : target.name;
        const role = payload.role !== undefined ? payload.role : target.role;
        if (!ROLES.has(role))
            return badRequest("ユーザー権限を選択してください。");
        const isActive = payload.isActive !== undefined ? (payload.isActive ? 1 : 0) : target.is_active;
        // 最後の有効な管理者を、降格・無効化で失わないようにする。
        const targetWasActiveAdmin = target.role === "admin" && target.is_active === 1;
        const willBeActiveAdmin = role === "admin" && isActive === 1;
        if (targetWasActiveAdmin && !willBeActiveAdmin) {
            if ((await otherActiveAdminCount(db, currentUser.client_id, target.id)) === 0) {
                return badRequest("最後の有効な管理者は降格・無効化できません。先に別の管理者を用意してください。");
            }
        }
        let newPassword = null;
        let passwordHash = null;
        if (payload.resetPassword) {
            // 再発行したパスワードも平文で保存しない。この応答で1度だけ返す。
            newPassword = generateInitialPassword();
            passwordHash = await hashPassword(newPassword);
        }
        const now = nowIso();
        if (passwordHash) {
            await db
                .prepare("UPDATE users SET name = ?, role = ?, is_active = ?, password_hash = ?, updated_at = ? WHERE id = ? AND client_id = ?")
                .bind(name, role, isActive, passwordHash, now, target.id, currentUser.client_id)
                .run();
        }
        else {
            await db
                .prepare("UPDATE users SET name = ?, role = ?, is_active = ?, updated_at = ? WHERE id = ? AND client_id = ?")
                .bind(name, role, isActive, now, target.id, currentUser.client_id)
                .run();
        }
        // 無効化したら既存セッションを失効させる（再ログインできなくする）。
        if (isActive === 0) {
            await db.prepare("DELETE FROM sessions WHERE user_id = ?").bind(target.id).run();
        }
        // 再発行したパスワードは渡す途中に平文が残る。受け取った本人が変えるまで印を付けておく。
        if (newPassword) {
            await setMustChangePassword(db, target.id, true);
        }
        await recordAudit(db, ctx.request, currentUser, {
            action: newPassword ? "user.password_reset" : "user.update",
            targetType: "user",
            targetId: target.id,
            summary: target.email,
        });
        return json({
            ok: true,
            user: {
                id: target.id,
                email: target.email,
                name,
                role,
                is_active: isActive,
                updated_at: now,
            },
            ...(newPassword ? { newPassword } : {}),
        });
    };
    const onRequestDelete = async (ctx) => {
        const currentUser = await requireUser(ctx.request, ctx.env, config, ["admin"]);
        if (currentUser instanceof Response)
            return currentUser;
        const db = requireDb(ctx.env);
        if (db instanceof Response)
            return db;
        const target = await loadTarget(db, currentUser.client_id, String(ctx.params.id));
        if (!target)
            return json({ ok: false, error: "not_found" }, { status: 404 });
        if (target.id === currentUser.id) {
            return badRequest("自分自身は削除できません。");
        }
        if (target.role === "admin" && target.is_active === 1) {
            if ((await otherActiveAdminCount(db, currentUser.client_id, target.id)) === 0) {
                return badRequest("最後の有効な管理者は削除できません。");
            }
        }
        await db.prepare("DELETE FROM sessions WHERE user_id = ?").bind(target.id).run();
        const result = await db
            .prepare("DELETE FROM users WHERE id = ? AND client_id = ?")
            .bind(target.id, currentUser.client_id)
            .run();
        if (result.meta.changes === 0) {
            return json({ ok: false, error: "not_found" }, { status: 404 });
        }
        await recordAudit(db, ctx.request, currentUser, {
            action: "user.delete",
            targetType: "user",
            targetId: target.id,
            summary: target.email,
        });
        return json({ ok: true });
    };
    return { onRequestPut, onRequestDelete };
}
