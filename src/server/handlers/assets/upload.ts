import type { BlogAdminConfig } from "../../../config/index.js";
import type { BlogAdminEnv } from "../../../config/env.js";
import {
  badRequest,
  json,
  nowIso,
  randomId,
  requireDb,
  requireUser,
  serverError,
} from "../../_shared/admin.js";
import {
  ALLOWED_IMAGE_MIME,
  MAX_UPLOAD_BYTES,
  hasDeniedExtension,
  sniffImageMime,
} from "../../_shared/assets.js";
import { recordAudit } from "../../_shared/audit.js";

function safeFileName(name: string): string {
  const cleaned = name
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return cleaned || "image";
}

export function createAssetUploadHandlers(config: BlogAdminConfig) {
  const onRequestPost: PagesFunction<BlogAdminEnv> = async (ctx) => {
    const user = await requireUser(ctx.request, ctx.env, config, [
      "admin",
      "client_publisher",
    ]);
    if (user instanceof Response) return user;
    const db = requireDb(ctx.env);
    if (db instanceof Response) return db;
    if (!ctx.env.ADMIN_ASSETS) return serverError("ADMIN_ASSETS binding is not configured.");

    const form = await ctx.request.formData();
    const file = form.get("file");
    const postId = typeof form.get("postId") === "string" ? String(form.get("postId")) : null;
    const alt = typeof form.get("alt") === "string" ? String(form.get("alt")).trim() : "";
    if (!file || typeof file === "string") return badRequest("file is required.");
    const upload = file as File;
    if (!ALLOWED_IMAGE_MIME.has(upload.type)) {
      return badRequest("Only JPEG, PNG, WebP, or GIF images are allowed.");
    }
    if (hasDeniedExtension(upload.name)) return badRequest("This file extension is not allowed.");
    if (upload.size > MAX_UPLOAD_BYTES) return badRequest("Image must be 5MB or smaller.");

    // Content-Type は詐称できるため、先頭バイトで実体を確認して正とする
    const buffer = await upload.arrayBuffer();
    const detected = sniffImageMime(new Uint8Array(buffer.slice(0, 12)));
    if (!detected) return badRequest("File content is not a valid image.");
    if (detected !== upload.type) return badRequest("File content does not match its declared type.");

    const id = randomId("asset");
    const key = `${id}-${safeFileName(upload.name)}`;
    await ctx.env.ADMIN_ASSETS.put(key, buffer, {
      httpMetadata: { contentType: detected },
    });

    const publicPath = ctx.env.ASSET_PUBLIC_BASE_URL
      ? `${ctx.env.ASSET_PUBLIC_BASE_URL.replace(/\/$/, "")}/${key}`
      : `/api/admin/assets/public/${key}`;

    await db
      .prepare(
        `INSERT INTO assets
         (id, client_id, post_id, r2_key, public_path, file_name, mime_type, size,
          alt, uploaded_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        id,
        user.client_id,
        postId,
        key,
        publicPath,
        upload.name,
        detected,
        upload.size,
        alt || null,
        user.id,
        nowIso()
      )
      .run();

    await recordAudit(db, ctx.request, user, {
      action: "asset.upload",
      targetType: "asset",
      targetId: id,
      summary: upload.name,
    });

    return json({
      ok: true,
      asset: {
        id,
        key,
        publicPath,
        fileName: upload.name,
        mimeType: detected,
        size: upload.size,
        alt,
      },
    });
  };

  return { onRequestPost };
}
