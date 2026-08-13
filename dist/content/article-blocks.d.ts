/**
 * 記事本文のブロック記法。
 *
 * 写真を使わない記事でも読み進められるよう、本文の途中に差し込む定型の視覚要素を
 * Markdown から書けるようにする。生の HTML を本文に書かせる方式は取らない
 * （公開側のサニタイズを外すことになり、書き手が増えたときに歯止めが無くなるため）。
 *
 * 記法は次の形。開始行の `:::` に続けてブロック名、必要なら空白区切りで引数を書く。
 *
 * ```
 * :::callout 今日の見方
 * 最初の3口・噛みごたえ・ながら食べの3つを見直します。
 * :::
 *
 * :::points
 * 場面 01 | 昼休みが短く、時計を見ながら食べる。
 * 場面 02 | スマホや動画を見ながら食べる。
 * :::
 *
 * :::compare
 * 続きにくい目標 | 毎食、全部を30回噛むと決める。
 * 始めやすい目標 | 最初の3口だけ、箸を置いてから飲み込む。
 * :::
 *
 * :::stat 29%
 * 健康管理アプリの3ヶ月後の継続率
 * :::
 *
 * :::faq
 * 何回噛めばよいですか？ | まずは最初の3口だけ箸を置くところから始めましょう。
 * :::
 * ```
 *
 * ブロックの中身はこのモジュールが必ずエスケープしてから組み立てる。
 * 例外はリンクと強調だけで、リンクは http/https のみ通す。
 */
/** 使えるブロック名。 */
export declare const ARTICLE_BLOCK_NAMES: readonly ["callout", "points", "compare", "stat", "faq"];
export type ArticleBlockName = (typeof ARTICLE_BLOCK_NAMES)[number];
export interface ArticleBlock {
    kind: "block";
    name: ArticleBlockName;
    /** 開始行でブロック名のあとに書いた文字列（callout の見出し、stat の数字）。 */
    arg: string;
    /** ブロックの中身を行単位で持つ。空行は落としてある。 */
    lines: string[];
}
export interface ArticleMarkdown {
    kind: "markdown";
    text: string;
}
export type ArticleSegment = ArticleMarkdown | ArticleBlock;
/**
 * 本文を「通常の Markdown」と「ブロック」に切り分ける。
 * 閉じ忘れたブロックは、そのまま Markdown として扱う（記事が消えるより崩れて見えるほうがよい）。
 */
export declare function splitArticleContent(markdown: string): ArticleSegment[];
/** ブロック1つを HTML にする。中身は必ずエスケープ済み。 */
export declare function renderArticleBlock(block: ArticleBlock): string;
/**
 * 本文を HTML にする。通常の Markdown 部分の変換だけ呼び出し側から渡す。
 *
 * 変換器をこのパッケージに持たないのは、公開側（remark など）と編集画面（marked）で
 * 使うライブラリが違うため。ブロックの見た目だけをここで揃える。
 */
export declare function renderArticleHtml(markdown: string, renderMarkdown: (source: string) => string): string;
/**
 * 非同期の Markdown 変換器（remark など）向け。
 * 中身は renderArticleHtml と同じ。
 */
export declare function renderArticleHtmlAsync(markdown: string, renderMarkdown: (source: string) => Promise<string>): Promise<string>;
