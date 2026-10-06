// 見たまま編集（TipTap）の中で、本文の装飾枠（`:::callout` など）を1つの塊として扱う。
//
// 枠の記法は TipTap の標準の要素に当てはまらない。何もしないと marked が枠を段落として出し、
// ProseMirror が段落内の改行を空白に畳み、保存時に turndown が `:::callout 見出し 本文 :::` の
// 1行へ戻してしまう。1行になった枠は公開ページで枠として描かれない。
//
// そこで枠は原文（`:::名前 引数` から閉じの `:::` まで）を属性に丸ごと持つ塊にする。
// 見たまま編集では中身を直せないカードとして表示し、削除・並べ替えだけできる。
// 中身を直したいときは「マークダウンで編集」に切り替える。
//
// Markdown の表も同じ塊にする（markdownToEditorHtml が表を塊の要素で渡す）。見たまま編集には
// 表の部品が無く、table のまま読ませるとセルの文字が1段落に連結され、保存すると表が消えるため。
import { Node } from "@tiptap/core";
import { renderArticleBlock, splitArticleContent } from "../../content/article-blocks.js";
import { ARTICLE_BLOCK_ATTR, ARTICLE_BLOCK_SOURCE_ATTR, markdownToHtml } from "./admin-markdown.js";
/** 動画の枠から URL を読み取れなかったときに、編集画面にだけ出す案内。 */
export const YOUTUBE_UNREADABLE_MESSAGE = "YouTube の URL を読み取れませんでした。公開ページには何も表示されません。「マークダウンで編集」で URL を確かめてください";
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
            const source = String(node.attrs.source ?? "");
            const segment = splitArticleContent(source).find((item) => item.kind === "block");
            // `:::` の枠でない塊は表（markdownToEditorHtml が表だけを塊にしている）
            const isTable = !segment;
            const card = document.createElement("div");
            if (isTable) {
                // markdownToHtml は生の HTML を落とし、危ないリンク先を外してから描く（プレビューと同じ変換）
                card.innerHTML = markdownToHtml(source);
                // セルの中のリンクを押して編集中の画面から離れないよう、カードの中は操作させない
                card.setAttribute("inert", "");
            }
            else {
                // renderArticleBlock は中身をすべてエスケープしてから組み立てる
                card.innerHTML = segment.kind === "block" ? renderArticleBlock(segment) : "";
            }
            if (segment?.kind === "block" && segment.name === "youtube") {
                if (!card.innerHTML) {
                    // 公開ページでは何も出ない。気づけるよう編集画面にだけ理由を出す
                    card.className = "admin-article-block-empty";
                    card.textContent = YOUTUBE_UNREADABLE_MESSAGE;
                }
                // カードの中の動画はクリックでもキーボードでも操作させない（再生はプレビューで確かめる）。
                // inert に対応しない環境向けに、iframe を Tab の順番からも外しておく
                card.setAttribute("inert", "");
                card.querySelectorAll("iframe").forEach((frame) => {
                    frame.tabIndex = -1;
                });
            }
            dom.appendChild(card);
            const note = document.createElement("p");
            note.className = "admin-article-block-note";
            note.textContent = isTable
                ? "表の中身は「マークダウンで編集」で直せます"
                : "装飾枠の中身は「マークダウンで編集」で直せます";
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
