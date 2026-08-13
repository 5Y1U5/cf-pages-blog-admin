import type { ReactNode } from "react";

import {
  renderArticleBlock,
  splitArticleContent,
} from "../content/article-blocks.js";

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
export function ArticleBody({ content, renderMarkdown }: ArticleBodyProps) {
  return (
    <>
      {splitArticleContent(content).map((segment, index) =>
        segment.kind === "block" ? (
          <div
            key={`block-${index}`}
            dangerouslySetInnerHTML={{ __html: renderArticleBlock(segment) }}
          />
        ) : (
          <div key={`markdown-${index}`}>{renderMarkdown(segment.text)}</div>
        )
      )}
    </>
  );
}
