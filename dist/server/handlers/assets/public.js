import { assetSecurityHeaders } from "../../_shared/assets.js";
/**
 * R2 のオブジェクトを配信する。設定に依存しない唯一のハンドラなので、
 * 導入側は再 export するだけでよい。
 */
export const onRequestGet = async (ctx) => {
    const key = String(ctx.params.key || "");
    if (!ctx.env.ADMIN_ASSETS || !key) {
        return new Response("Not found", { status: 404 });
    }
    const object = await ctx.env.ADMIN_ASSETS.get(key);
    if (!object)
        return new Response("Not found", { status: 404 });
    // 過去にアップロード済みの許可外オブジェクト（SVG 等）もここで無害化する
    return new Response(object.body, {
        headers: {
            ...assetSecurityHeaders(object.httpMetadata?.contentType || "", key),
            "Cache-Control": "public, max-age=31536000, immutable",
        },
    });
};
