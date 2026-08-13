export declare function markdownToHtml(markdown: string): string;
/**
 * turndown を先に読み込んでおく。編集画面の表示時に呼んでおくと、
 * 最初の入力で変換が一拍待たされるのを避けられる。
 */
export declare function preloadMarkdownConverter(): Promise<void>;
export declare function htmlToMarkdown(html: string): Promise<string>;
/**
 * リッチエディタとマークダウンを往復させたとき、意味が同じでも文字列が変わることがある
 * （空行の数、エスケープなど）。無用な差分で「未保存」判定が出ないよう、比較用に正規化する。
 */
export declare function normalizeMarkdown(markdown: string): string;
