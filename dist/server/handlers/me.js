import { json, requireUser } from "../_shared/admin.js";
export function createMeHandlers(config) {
    const onRequestGet = async (ctx) => {
        const user = await requireUser(ctx.request, ctx.env, config);
        if (user instanceof Response)
            return user;
        return json({ ok: true, user });
    };
    return { onRequestGet };
}
