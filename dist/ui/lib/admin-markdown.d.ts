export declare function markdownToHtml(markdown: string): string;
export declare function htmlToMarkdown(html: string): string;
/**
 * リッチエディタとマークダウンを往復させたとき、意味が同じでも文字列が変わることがある
 * （空行の数、エスケープなど）。無用な差分で「未保存」判定が出ないよう、比較用に正規化する。
 */
export declare function normalizeMarkdown(markdown: string): string;
