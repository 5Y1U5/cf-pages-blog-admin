// リッチエディタ用に、マークダウンと HTML を相互変換する。
//
// 記事の保存形式はマークダウンのまま。編集中だけ HTML として扱い、保存時にマークダウンへ戻すため、
// 公開パイプライン（server/_shared/posts.ts）は変換の有無に影響されない。
import { marked } from "marked";
// turndown と turndown-plugin-gfm は CommonJS で、DOM も要る。
// モジュールの先頭で import すると、サーバー側で管理画面を描画する構成
// （Workers 上の SSR など）で読み込みごと失敗する。ブラウザで初めて必要になった時点で読む。
let turndown = null;
let loading = null;
async function getTurndown() {
    if (turndown)
        return turndown;
    if (loading)
        return loading;
    loading = buildTurndown();
    return loading;
}
async function buildTurndown() {
    const [{ default: TurndownServiceCtor }, { gfm }] = await Promise.all([
        import("turndown"),
        import("turndown-plugin-gfm"),
    ]);
    const service = new TurndownServiceCtor({
        // 表示側は GFM 系の想定。既存記事に合わせて ATX 見出し（##）を使う。
        headingStyle: "atx",
        bulletListMarker: "-",
        codeBlockStyle: "fenced",
        emDelimiter: "*",
        strongDelimiter: "**",
        hr: "---",
        linkStyle: "inlined",
    });
    // テーブル・打ち消し線を維持する（GFM 側が解釈できる形で出力される）
    service.use(gfm);
    // turndown の既定は "-   項目"（記号のあと空白3つ）。一般的な記事は "- 項目" なので、
    // 1行直しただけでリスト全行に差分が出ないよう既存の書き方へ揃える。
    // 継続行のインデントは接頭辞と同じ幅にする（"1. " なら3つ）。ここを固定幅にすると
    // 番号付きリストの入れ子が壊れる。
    service.addRule("compactListItem", {
        filter: "li",
        replacement: (content, node, options) => {
            let prefix = `${options.bulletListMarker} `;
            const parent = node.parentNode;
            if (parent && parent.nodeName === "OL") {
                const start = parent.getAttribute("start");
                const index = Array.prototype.indexOf.call(parent.children, node);
                prefix = `${start ? Number(start) + index : index + 1}. `;
            }
            const indent = " ".repeat(prefix.length);
            const body = content
                .replace(/^\n+/, "")
                .replace(/\n+$/, "\n")
                .replace(/\n/gm, `\n${indent}`);
            return prefix + body + (node.nextSibling && !/\n$/.test(body) ? "\n" : "");
        },
    });
    // TipTap（ProseMirror）は list item の中身を必ず <p> で包む。
    // turndown の既定ではこの <p> が前後に空行を作り、詰まったリストが緩いリストへ変わって
    // 項目間の余白が広がってしまう。既存記事は詰まったリストなので、li 直下の段落は
    // 空行を付けずに出す。段落が複数ある li だけ空行で区切る。
    service.addRule("tightListParagraph", {
        filter: (node) => node.nodeName === "P" && node.parentNode?.nodeName === "LI",
        replacement: (content, node) => {
            const next = node.nextElementSibling;
            if (!next)
                return content;
            // 入れ子のリストが続く場合に空行を挟むと、外側のリストまで緩くなって余白が広がる
            if (next.nodeName === "UL" || next.nodeName === "OL")
                return `${content}\n`;
            return `${content}\n\n`;
        },
    });
    turndown = service;
    return service;
}
export function markdownToHtml(markdown) {
    if (!markdown.trim())
        return "";
    return marked.parse(markdown, { async: false, gfm: true, breaks: false });
}
/**
 * turndown を先に読み込んでおく。編集画面の表示時に呼んでおくと、
 * 最初の入力で変換が一拍待たされるのを避けられる。
 */
export async function preloadMarkdownConverter() {
    await getTurndown();
}
export async function htmlToMarkdown(html) {
    if (!html.trim())
        return "";
    const service = await getTurndown();
    return (service
        .turndown(html)
        // 空段落由来の3行以上の空行を詰める
        .replace(/\n{3,}/g, "\n\n")
        // turndown は行頭の "1. " を箇条書きと誤読されないようエスケープするが、
        // 見出し行（"## 1. まず〜"）では箇条書きになりようがないので元に戻す。
        // これを入れないと "## 1\. まず〜" というバックスラッシュが本文に残る。
        .replace(/^(#{1,6} .*)$/gm, (line) => line.replace(/(\d)\\\./g, "$1."))
        .trim());
}
/**
 * リッチエディタとマークダウンを往復させたとき、意味が同じでも文字列が変わることがある
 * （空行の数、エスケープなど）。無用な差分で「未保存」判定が出ないよう、比較用に正規化する。
 */
export function normalizeMarkdown(markdown) {
    return markdown
        .replace(/\r\n/g, "\n")
        .split("\n")
        .map((line) => {
        const trimmed = line.replace(/[ \t]+$/, "");
        // 内容のある行の末尾に空白2つ以上があればマークダウンの強制改行（<br>）。
        // 消すと段落が繋がって表示が変わるため2つに揃えて残す。
        // 空白だけの行はリストのインデント由来のゴミなので落とす。
        return trimmed && / {2,}$/.test(line) ? `${trimmed}  ` : trimmed;
    })
        .join("\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}
