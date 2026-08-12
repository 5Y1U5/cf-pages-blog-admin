// アセット（画像）アップロード・配信の共通ガード。
// SVG など script を実行しうる形式を排除し、配信側でも二重に防ぐ。

/** アップロード・配信を許可する MIME。SVG は意図的に除外（内部の script が実行されうるため）。 */
export const ALLOWED_IMAGE_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

/** 拡張子ベースの拒否リスト。MIME を偽装されても弾く。 */
const DENIED_EXTENSIONS = /\.(svg|svgz|html?|xht(ml)?|xml|js|mjs|css)$/i;

export function hasDeniedExtension(fileName: string): boolean {
  return DENIED_EXTENSIONS.test(fileName);
}

/** アップロードの上限サイズ。ブラウザ側の事前検査もこの値を参照する。 */
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

/**
 * 先頭バイト（マジックナンバー）から実体を判定する。
 * Content-Type ヘッダは client が自由に付けられるため、これを正とする。
 */
export function sniffImageMime(bytes: Uint8Array): string | null {
  // JPEG: FF D8 FF
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length >= 8 && png.every((b, i) => bytes[i] === b)) {
    return "image/png";
  }
  // GIF: "GIF87a" / "GIF89a"
  if (
    bytes.length >= 6 &&
    bytes[0] === 0x47 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x38 &&
    (bytes[4] === 0x37 || bytes[4] === 0x39) &&
    bytes[5] === 0x61
  ) {
    return "image/gif";
  }
  // WebP: "RIFF" ....(4byte size).... "WEBP"
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  return null;
}

/** ヘッダに埋め込んでも安全なファイル名へ落とす（ヘッダインジェクション防止）。 */
export function headerSafeFileName(name: string): string {
  const cleaned = name.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return cleaned || "asset";
}

/** 配信レスポンスの共通セキュリティヘッダ。 */
export function assetSecurityHeaders(
  contentType: string,
  fileName: string
): Record<string, string> {
  const isAllowed = ALLOWED_IMAGE_MIME.has(contentType);
  const safeName = headerSafeFileName(fileName);
  return {
    // 許可外（過去にアップされた SVG 等を含む）はブラウザに解釈させず添付扱いにする
    "Content-Type": isAllowed ? contentType : "application/octet-stream",
    "Content-Disposition": `${isAllowed ? "inline" : "attachment"}; filename="${safeName}"`,
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; sandbox; style-src 'unsafe-inline'",
  };
}
