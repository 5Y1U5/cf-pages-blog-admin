// 画像アップロードの前処理（ブラウザ側）。
// スマートフォンの写真をそのまま送ると数MB・長辺4000px級になり、配信も遅く上限にも当たるため、
// 送信前に縮小・再エンコードする。サーバー側の検査仕様は変わらない。
// 長辺の上限。アイキャッチは 16:9 で表示するため 1600px あれば 2x 相当を満たす。
const MAX_EDGE = 1600;
const QUALITY = 0.82;
// これ以下なら手を加えない（再エンコードで劣化・肥大するのを避ける）
const SKIP_BYTES = 300 * 1024;
// アニメーション GIF はフレームが飛び、SVG はベクタのままのほうが良いので触らない
const SKIP_TYPES = new Set(["image/gif", "image/svg+xml"]);
// サーバー側 server/_shared/assets.ts の ALLOWED_IMAGE_MIME と揃える。
// ここに無い形式のまま送るとサーバーで拒否されるため、変換できたかどうかの判定にも使う。
const UPLOADABLE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
// サーバー側 server/_shared/assets.ts の DENIED_EXTENSIONS と揃える。
const DENIED_EXTENSIONS = /\.(svg|svgz|html?|xht(ml)?|xml|js|mjs|css)$/i;
/** サーバー側 server/_shared/assets.ts の MAX_UPLOAD_BYTES と揃える。 */
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
// アップロード API は理由を英語で返すため、そのまま出さず日本語に置き換える。
const UPLOAD_ERROR_MESSAGES_JA = {
    "file is required.": "画像ファイルを選択してください。",
    "Only JPEG, PNG, WebP, or GIF images are allowed.": "アップロードできるのは JPEG・PNG・WebP・GIF の画像だけです。写真アプリなどで JPEG として保存し直してからお試しください。",
    "This file extension is not allowed.": "この拡張子のファイルはアップロードできません。JPEG か PNG の画像をお使いください。",
    "Image must be 5MB or smaller.": "画像の容量が大きすぎます。5MB 以下の画像をお使いください。",
    "File content is not a valid image.": "画像として読み取れませんでした。ファイルが壊れていないかご確認のうえ、別の画像をお試しください。",
    "File content does not match its declared type.": "画像の中身と形式が一致しませんでした。写真アプリなどで JPEG として保存し直してからお試しください。",
};
/** サーバーが返したエラー文言を日本語に置き換える。対応表に無ければそのまま返す。 */
export function translateUploadError(message) {
    const reason = message || "";
    return UPLOAD_ERROR_MESSAGES_JA[reason] || reason || "画像をアップロードできませんでした。";
}
/** そのままサーバーへ送って受理される形式か。 */
function isUploadable(file) {
    return UPLOADABLE_TYPES.has(file.type) && !DENIED_EXTENSIONS.test(file.name);
}
/** 画像形式の呼び名。type が空で渡ってくる HEIC 等があるのでファイル名も見る。 */
function formatLabel(file) {
    const hint = `${file.type} ${file.name}`;
    if (/heic|heif/i.test(hint))
        return "heic";
    if (/avif/i.test(hint))
        return "avif";
    if (/svgz?\b|svg\+xml/i.test(hint))
        return "svg";
    if (/bmp/i.test(hint))
        return "bmp";
    if (/tiff?\b/i.test(hint))
        return "tiff";
    const extension = file.name.match(/\.([^.]+)$/)?.[1];
    return (file.type || extension || "").toLowerCase();
}
/** サーバーに拒否される形式のとき、利用者が次に何をすればよいか分かる文面を返す。 */
function unsupportedReason(file) {
    const label = formatLabel(file);
    if (label === "svg") {
        return "SVG 形式の画像は安全のためアップロードできません。PNG か JPEG に書き出してからお試しください。";
    }
    if (label === "heic") {
        return "iPhone の写真形式（HEIC）のままではアップロードできません。このブラウザでは自動変換できませんでした。iPhone の「設定 → カメラ → フォーマット」を「互換性優先」に変えて撮り直すか、写真アプリで JPEG として書き出してからお試しください。";
    }
    const name = label ? `この画像（${label} 形式）` : "この画像";
    return `${name}はアップロードできません。このブラウザでは自動変換できませんでした。対応しているのは JPEG・PNG・WebP・GIF です。写真アプリなどで JPEG として保存し直してからお試しください。`;
}
function replaceExtension(name, extension) {
    const base = name.replace(/\.[^./\\]+$/, "") || "image";
    return `${base}.${extension}`;
}
async function decode(file) {
    if (typeof createImageBitmap === "function") {
        // EXIF の回転情報を反映させる。これを付けないと縦向きの写真が横倒しになる。
        const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
        return { source: bitmap, width: bitmap.width, height: bitmap.height };
    }
    const url = URL.createObjectURL(file);
    try {
        const image = await new Promise((resolve, reject) => {
            const element = new Image();
            element.onload = () => resolve(element);
            element.onerror = () => reject(new Error("image decode failed"));
            element.src = url;
        });
        return { source: image, width: image.naturalWidth, height: image.naturalHeight };
    }
    finally {
        URL.revokeObjectURL(url);
    }
}
function toBlob(canvas, type) {
    return new Promise((resolve) => canvas.toBlob(resolve, type, QUALITY));
}
/**
 * アップロード前に画像を縮小する。
 * 変換できない形式・変換すると逆に大きくなる場合は元ファイルをそのまま返す。
 */
export async function prepareImageForUpload(file) {
    const alreadyUploadable = isUploadable(file);
    // 元ファイルをそのまま返すときの結果。受理されない形式ならここで理由を付ける。
    const asIs = () => ({
        file,
        changed: false,
        originalSize: file.size,
        blockedReason: alreadyUploadable ? null : unsupportedReason(file),
    });
    if (SKIP_TYPES.has(file.type))
        return asIs();
    // 画像でないものは触らない。ただし HEIC などは type が空で渡ってくる環境があるため、
    // 空の場合は変換を試す（対応ブラウザなら createImageBitmap で読めることがある）。
    if (file.type && !file.type.startsWith("image/"))
        return asIs();
    if (typeof document === "undefined")
        return asIs();
    let decoded;
    try {
        decoded = await decode(file);
    }
    catch {
        // 読めない画像。受理される形式ならサーバーに判断を任せ、そうでなければ理由を返す
        return asIs();
    }
    const { source, width, height } = decoded;
    if (!width || !height)
        return asIs();
    const scale = Math.min(1, MAX_EDGE / Math.max(width, height));
    // 既に十分小さく容量も軽いなら何もしない（受理される形式のときだけ。
    // HEIC 等は軽くても変換しないとサーバーに拒否されるため素通しにしない）
    if (scale === 1 && file.size <= SKIP_BYTES && alreadyUploadable) {
        if (source instanceof ImageBitmap)
            source.close();
        return asIs();
    }
    const targetWidth = Math.max(1, Math.round(width * scale));
    const targetHeight = Math.max(1, Math.round(height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const context = canvas.getContext("2d");
    if (!context) {
        if (source instanceof ImageBitmap)
            source.close();
        return asIs();
    }
    context.imageSmoothingQuality = "high";
    context.drawImage(source, 0, 0, targetWidth, targetHeight);
    if (source instanceof ImageBitmap)
        source.close();
    // WebP を書き出せない環境では toBlob が PNG を返すため、
    // 返ってきた実際の type を見て JPEG へ切り替える。
    let blob = await toBlob(canvas, "image/webp");
    let extension = "webp";
    if (!blob || blob.type !== "image/webp") {
        const hasAlpha = file.type === "image/png" || file.type === "image/webp";
        if (hasAlpha) {
            // JPEG は透過を落として黒くなるので、白で敷いてから書き出す
            context.globalCompositeOperation = "destination-over";
            context.fillStyle = "#ffffff";
            context.fillRect(0, 0, targetWidth, targetHeight);
            context.globalCompositeOperation = "source-over";
        }
        blob = await toBlob(canvas, "image/jpeg");
        extension = "jpg";
    }
    if (!blob)
        return asIs();
    // 元より重くなるなら意味がないので元を使う（元がそのまま送れる形式のときだけ）
    if (blob.size >= file.size && scale === 1 && alreadyUploadable)
        return asIs();
    const prepared = new File([blob], replaceExtension(file.name, extension), {
        type: blob.type,
        lastModified: Date.now(),
    });
    return {
        file: prepared,
        changed: true,
        originalSize: file.size,
        // 書き出し結果が想定外の形式だった場合もサーバーに送らず理由を出す
        blockedReason: isUploadable(prepared) ? null : unsupportedReason(prepared),
    };
}
export function formatBytes(bytes) {
    if (bytes >= 1024 * 1024)
        return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
    return `${Math.max(1, Math.round(bytes / 1024))}KB`;
}
