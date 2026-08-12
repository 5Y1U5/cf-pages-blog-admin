/** サーバー側 server/_shared/assets.ts の MAX_UPLOAD_BYTES と揃える。 */
export declare const MAX_UPLOAD_BYTES: number;
/** サーバーが返したエラー文言を日本語に置き換える。対応表に無ければそのまま返す。 */
export declare function translateUploadError(message: string | undefined): string;
export interface PreparedImage {
    file: File;
    /** 縮小・再エンコードを実際に行ったか */
    changed: boolean;
    originalSize: number;
    /**
     * サーバーが受け付ける形式にできなかった場合の、日本語の理由。
     * null なら送信してよい。呼び出し側はこれが入っていたら送信せずに表示する。
     */
    blockedReason: string | null;
}
/**
 * アップロード前に画像を縮小する。
 * 変換できない形式・変換すると逆に大きくなる場合は元ファイルをそのまま返す。
 */
export declare function prepareImageForUpload(file: File): Promise<PreparedImage>;
export declare function formatBytes(bytes: number): string;
