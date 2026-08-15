import { json, requireUser } from "../_shared/admin.js";
export function createMeHandlers(config) {
    const onRequestGet = async (ctx) => {
        // パスワードの変更が必要な状態でも、それを画面に伝えるためにここだけは通す。
        const user = await requireUser(ctx.request, ctx.env, config, undefined, {
            allowPasswordChangePending: true,
        });
        if (user instanceof Response)
            return user;
        return json({
            ok: true,
            user,
            mustChangePassword: user.must_change_password === 1,
        });
    };
    return { onRequestGet };
}
