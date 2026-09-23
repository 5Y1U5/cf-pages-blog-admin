import { type ArticleBlock } from "../../content/article-blocks.js";
/** 見たまま編集の HTML の中で、装飾枠を表す要素の目印（ArticleBlock と共有）。 */
export declare const ARTICLE_BLOCK_ATTR = "data-article-block";
/** 枠の原文を入れる属性。改行や記号をそのまま運ぶため encodeURIComponent した値を入れる。 */
export declare const ARTICLE_BLOCK_SOURCE_ATTR = "data-source";
export declare function markdownToHtml(markdown: string): string;
/** 装飾枠を記法どおりの原文に組み直す（開始行・中身・閉じ行）。 */
export declare function articleBlockSource(block: ArticleBlock): string;
/**
 * 見たまま編集に渡す HTML を作る。
 *
 * markdownToHtml と違い、装飾枠（`:::callout` など）を段落にせず、原文を持った塊の要素にする。
 * 見たまま編集はこの要素を ArticleBlock として読み、保存時は htmlToMarkdown が原文へ戻す。
 * 閉じ忘れの枠は splitArticleContent が通常の Markdown として返すので、今までどおり段落になる。
 */
export declare function markdownToEditorHtml(markdown: string): string;
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
