import type { BlogAdminConfig } from "../../../config/index.js";
import type { BlogAdminEnv } from "../../../config/env.js";
import {
  clearSessionCookie,
  json,
  parseCookies,
  requireDb,
  sha256Hex,
} from "../../_shared/admin.js";

export function createLogoutHandlers(config: BlogAdminConfig) {
  const onRequestPost: PagesFunction<BlogAdminEnv> = async (ctx) => {
    const db = requireDb(ctx.env);
    if (db instanceof Response) return db;

    const token = parseCookies(ctx.request)[config.sessionCookieName];
    if (token) {
      await db
        .prepare("DELETE FROM sessions WHERE token_hash = ?")
        .bind(await sha256Hex(token))
        .run();
    }

    return json({ ok: true }, { headers: { "Set-Cookie": clearSessionCookie(config) } });
  };

  return { onRequestPost };
}
