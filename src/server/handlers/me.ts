import type { BlogAdminConfig } from "../../config/index.js";
import type { BlogAdminEnv } from "../../config/env.js";
import { json, requireUser } from "../_shared/admin.js";

export function createMeHandlers(config: BlogAdminConfig) {
  const onRequestGet: PagesFunction<BlogAdminEnv> = async (ctx) => {
    const user = await requireUser(ctx.request, ctx.env, config);
    if (user instanceof Response) return user;
    return json({ ok: true, user });
  };

  return { onRequestGet };
}
