import type { AdminRole, BlogAdminConfig } from "../../../config/index.js";
import type { BlogAdminEnv } from "../../../config/env.js";
import {
  badRequest,
  hashPassword,
  json,
  normalizeString,
  nowIso,
  readJson,
  requireDb,
  requireUser,
} from "../../_shared/admin.js";
import { generateInitialPassword } from "./password.js";

const ROLES = new Set<AdminRole>(["admin", "client_publisher", "client_viewer"]);

interface UpdateUserPayload {
  name?: string;
  role?: AdminRole;
  isActive?: boolean;
  resetPassword?: boolean;
}

interface TargetUser {
  id: string;
  email: string;
  name: string;
  role: AdminRole;
  is_active: number;
}

function loadTarget(
  db: D1Database,
  clientId: string,
  id: string
): Promise<TargetUser | null> {
  return db
    .prepare(
      "SELECT id, email, name, role, is_active FROM users WHERE id = ? AND client_id = ? LIMIT 1"
    )
    .bind(id, clientId)
    .first<TargetUser>();
}

// 自分以外で有効な管理者が何人いるか（最後の管理者を失わないための判定に使う）。
async function otherActiveAdminCount(
  db: D1Database,
  clientId: string,
  excludeId: string
): Promise<number> {
  const row = await db
    .prepare(
      "SELECT COUNT(*) AS c FROM users WHERE client_id = ? AND role = 'admin' AND is_active = 1 AND id <> ?"
    )
    .bind(clientId, excludeId)
    .first<{ c: number }>();
  return Number(row?.c ?? 0);
}

export function createUserDetailHandlers(config: BlogAdminConfig) {
  const onRequestPut: PagesFunction<BlogAdminEnv> = async (ctx) => {
    const currentUser = await requireUser(ctx.request, ctx.env, config, ["admin"]);
    if (currentUser instanceof Response) return currentUser;
    const db = requireDb(ctx.env);
    if (db instanceof Response) return db;

    const target = await loadTarget(db, currentUser.client_id, String(ctx.params.id));
    if (!target) return json({ ok: false, error: "not_found" }, { status: 404 });

    const payload = await readJson<UpdateUserPayload>(ctx.request);
    if (payload instanceof Response) return payload;

    const name =
      payload.name !== undefined ? normalizeString(payload.name) || target.name : target.name;
    const role = payload.role !== undefined ? payload.role : target.role;
    if (!ROLES.has(role)) return badRequest("ユーザー権限を選択してください。");
    const isActive =
      payload.isActive !== undefined ? (payload.isActive ? 1 : 0) : target.is_active;

    // 最後の有効な管理者を、降格・無効化で失わないようにする。
    const targetWasActiveAdmin = target.role === "admin" && target.is_active === 1;
    const willBeActiveAdmin = role === "admin" && isActive === 1;
    if (targetWasActiveAdmin && !willBeActiveAdmin) {
      if ((await otherActiveAdminCount(db, currentUser.client_id, target.id)) === 0) {
        return badRequest(
          "最後の有効な管理者は降格・無効化できません。先に別の管理者を用意してください。"
        );
      }
    }

    let newPassword: string | null = null;
    let passwordHash: string | null = null;
    if (payload.resetPassword) {
      // 再発行したパスワードも平文で保存しない。この応答で1度だけ返す。
      newPassword = generateInitialPassword();
      passwordHash = await hashPassword(newPassword);
    }

    const now = nowIso();
    if (passwordHash) {
      await db
        .prepare(
          "UPDATE users SET name = ?, role = ?, is_active = ?, password_hash = ?, updated_at = ? WHERE id = ? AND client_id = ?"
        )
        .bind(name, role, isActive, passwordHash, now, target.id, currentUser.client_id)
        .run();
    } else {
      await db
        .prepare(
          "UPDATE users SET name = ?, role = ?, is_active = ?, updated_at = ? WHERE id = ? AND client_id = ?"
        )
        .bind(name, role, isActive, now, target.id, currentUser.client_id)
        .run();
    }

    // 無効化したら既存セッションを失効させる（再ログインできなくする）。
    if (isActive === 0) {
      await db.prepare("DELETE FROM sessions WHERE user_id = ?").bind(target.id).run();
    }

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

  const onRequestDelete: PagesFunction<BlogAdminEnv> = async (ctx) => {
    const currentUser = await requireUser(ctx.request, ctx.env, config, ["admin"]);
    if (currentUser instanceof Response) return currentUser;
    const db = requireDb(ctx.env);
    if (db instanceof Response) return db;

    const target = await loadTarget(db, currentUser.client_id, String(ctx.params.id));
    if (!target) return json({ ok: false, error: "not_found" }, { status: 404 });

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
    return json({ ok: true });
  };

  return { onRequestPut, onRequestDelete };
}
