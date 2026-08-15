import type { BlogAdminConfig } from "../../../config/index.js";
import type { BlogAdminEnv } from "../../../config/env.js";
import {
  clearSessionCookie,
  json,
  parseCookies,
  requireDb,
  sha256Hex,
} from "../../_shared/admin.js";
import { recordAudit } from "../../_shared/audit.js";

export function createLogoutHandlers(config: BlogAdminConfig) {
  const onRequestPost: PagesFunction<BlogAdminEnv> = async (ctx) => {
    const db = requireDb(ctx.env);
    if (db instanceof Response) return db;

    const token = parseCookies(ctx.request)[config.sessionCookieName];
    if (token) {
      const tokenHash = await sha256Hex(token);
      // 誰のセッションだったかは消す前にしか分からないので、先に読んでおく。
      const actor = await db
        .prepare(
          `SELECT users.id, users.email, users.client_id
           FROM sessions
           INNER JOIN users ON users.id = sessions.user_id
           WHERE sessions.token_hash = ?
           LIMIT 1`
        )
        .bind(tokenHash)
        .first<{ id: string; email: string; client_id: string }>();

      await db.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(tokenHash).run();

      if (actor) {
        await recordAudit(db, ctx.request, actor, { action: "auth.logout" });
      }
    }

    return json({ ok: true }, { headers: { "Set-Cookie": clearSessionCookie(config) } });
  };

  return { onRequestPost };
}
