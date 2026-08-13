import { type ReactNode } from "react";
export interface ArticleBodyProps {
    /** 記事本文の Markdown。ブロック記法を含んでいてよい。 */
    content: string;
    /**
     * 通常の Markdown 部分をどう描くか。
     * react-markdown を使うサイトが多いので、文字列ではなく要素で受ける。
     */
    renderMarkdown: (source: string) => ReactNode;
}
/**
 * 記事本文を描く。ブロック記法の部分だけこのパッケージが組み立て、
 * それ以外は導入側の Markdown 描画に任せる。
 *
 * ブロックの HTML はパッケージ内でエスケープしてから作っているので、
 * ここで dangerouslySetInnerHTML を使っても記事本文の中身は素通ししていない。
 *
 * ```tsx
 * <ArticleBody
 *   content={post.content}
 *   renderMarkdown={(source) => (
 *     <ReactMarkdown remarkPlugins={[remarkGfm]}>{source}</ReactMarkdown>
 *   )}
 * />
 * ```
 */
export declare function ArticleBody({ content, renderMarkdown }: ArticleBodyProps): import("react").JSX.Element;
