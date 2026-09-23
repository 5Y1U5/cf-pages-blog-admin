// 見たまま編集（TipTap）の中で、本文の装飾枠（`:::callout` など）を1つの塊として扱う。
//
// 枠の記法は TipTap の標準の要素に当てはまらない。何もしないと marked が枠を段落として出し、
// ProseMirror が段落内の改行を空白に畳み、保存時に turndown が `:::callout 見出し 本文 :::` の
// 1行へ戻してしまう。1行になった枠は公開ページで枠として描かれない。
//
// そこで枠は原文（`:::名前 引数` から閉じの `:::` まで）を属性に丸ごと持つ塊にする。
// 見たまま編集では中身を直せないカードとして表示し、削除・並べ替えだけできる。
// 中身を直したいときは「マークダウンで編集」に切り替える。
import { Node } from "@tiptap/core";
import { renderArticleBlock, splitArticleContent } from "../../content/article-blocks.js";
import { ARTICLE_BLOCK_ATTR, ARTICLE_BLOCK_SOURCE_ATTR } from "./admin-markdown.js";
function decodeSource(value) {
    if (!value)
        return "";
    try {
        return decodeURIComponent(value);
    }
    catch {
        return "";
    }
}
/** 要素に入っている装飾枠の原文を取り出す。 */
export function readArticleBlockSource(element) {
    return decodeSource(element.getAttribute(ARTICLE_BLOCK_SOURCE_ATTR));
}
export const ArticleBlock = Node.create({
    name: "articleBlock",
    group: "block",
    atom: true,
    selectable: true,
    draggable: false,
    addAttributes() {
        return {
            source: {
                default: "",
                parseHTML: (element) => readArticleBlockSource(element),
                // 属性の書き出しは renderHTML で行う（encode の形を1か所に揃えるため）
                renderHTML: () => ({}),
            },
        };
    },
    parseHTML() {
        // 段落など他の規則より先に当てる
        return [{ tag: `div[${ARTICLE_BLOCK_ATTR}]`, priority: 100 }];
    },
    renderHTML({ node }) {
        const source = String(node.attrs.source ?? "");
        // 中身に原文を文字として入れておく。turndown は中身の空の要素を読み飛ばすため、
        // 空のままだと保存時に枠ごと消えてしまう。
        return [
            "div",
            {
                [ARTICLE_BLOCK_ATTR]: "",
                [ARTICLE_BLOCK_SOURCE_ATTR]: encodeURIComponent(source),
            },
            source,
        ];
    },
    addNodeView() {
        return ({ node }) => {
            const dom = document.createElement("div");
            dom.className = "admin-article-preview admin-article-block";
            dom.contentEditable = "false";
            dom.setAttribute(ARTICLE_BLOCK_ATTR, "");
            const segment = splitArticleContent(String(node.attrs.source ?? "")).find((item) => item.kind === "block");
            const card = document.createElement("div");
            // renderArticleBlock は中身をすべてエスケープしてから組み立てる
            card.innerHTML = segment && segment.kind === "block" ? renderArticleBlock(segment) : "";
            dom.appendChild(card);
            const note = document.createElement("p");
            note.className = "admin-article-block-note";
            note.textContent = "装飾枠の中身は「マークダウンで編集」で直せます";
            dom.appendChild(note);
            return {
                dom,
                // カードの中の変化を ProseMirror に編集として拾わせない
                ignoreMutation: () => true,
                stopEvent: () => false,
            };
        };
    },
});
