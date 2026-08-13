import { jsx as _jsx, Fragment as _Fragment } from "react/jsx-runtime";
import { Fragment } from "react";
import { renderArticleBlock, splitArticleContent, } from "../content/article-blocks.js";
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
export function ArticleBody({ content, renderMarkdown }) {
    return (_jsx(_Fragment, { children: splitArticleContent(content).map((segment, index) => segment.kind === "block" ? (_jsx("div", { dangerouslySetInnerHTML: { __html: renderArticleBlock(segment) } }, `block-${index}`)) : (
        // Markdown 部分は要素で包まない。導入先の記事CSSが
        // `.article-body > * + *` のような直下セレクタで余白を作っていることが多く、
        // div で包むと段落どうしの余白が消えるため。
        _jsx(Fragment, { children: renderMarkdown(segment.text) }, `markdown-${index}`))) }));
}
