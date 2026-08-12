/** アップロード・配信を許可する MIME。SVG は意図的に除外（内部の script が実行されうるため）。 */
export declare const ALLOWED_IMAGE_MIME: Set<string>;
export declare function hasDeniedExtension(fileName: string): boolean;
/** アップロードの上限サイズ。ブラウザ側の事前検査もこの値を参照する。 */
export declare const MAX_UPLOAD_BYTES: number;
/**
 * 先頭バイト（マジックナンバー）から実体を判定する。
 * Content-Type ヘッダは client が自由に付けられるため、これを正とする。
 */
export declare function sniffImageMime(bytes: Uint8Array): string | null;
/** ヘッダに埋め込んでも安全なファイル名へ落とす（ヘッダインジェクション防止）。 */
export declare function headerSafeFileName(name: string): string;
/** 配信レスポンスの共通セキュリティヘッダ。 */
export declare function assetSecurityHeaders(contentType: string, fileName: string): Record<string, string>;
