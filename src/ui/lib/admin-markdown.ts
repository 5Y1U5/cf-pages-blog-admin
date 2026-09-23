// リッチエディタ用に、マークダウンと HTML を相互変換する。
//
// 記事の保存形式はマークダウンのまま。編集中だけ HTML として扱い、保存時にマークダウンへ戻すため、
// 公開パイプライン（server/_shared/posts.ts）は変換の有無に影響されない。

import { Marked, type Links } from "marked";
import type TurndownService from "turndown";

import { splitArticleContent, type ArticleBlock } from "../../content/article-blocks.js";

/** 見たまま編集の HTML の中で、装飾枠を表す要素の目印（ArticleBlock と共有）。 */
export const ARTICLE_BLOCK_ATTR = "data-article-block";
/** 枠の原文を入れる属性。改行や記号をそのまま運ぶため encodeURIComponent した値を入れる。 */
export const ARTICLE_BLOCK_SOURCE_ATTR = "data-source";

// turndown と turndown-plugin-gfm は CommonJS で、DOM も要る。
// モジュールの先頭で import すると、サーバー側で管理画面を描画する構成
// （Workers 上の SSR など）で読み込みごと失敗する。ブラウザで初めて必要になった時点で読む。
let turndown: TurndownService | null = null;
let loading: Promise<TurndownService> | null = null;

async function getTurndown(): Promise<TurndownService> {
  if (turndown) return turndown;
  if (loading) return loading;
  loading = buildTurndown();
  return loading;
}

async function buildTurndown(): Promise<TurndownService> {
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

  // 装飾枠（見たまま編集の ArticleBlock）は、属性に持たせた原文をそのまま戻す。
  // 中身の文字（renderHTML が入れた原文）は使わない。エスケープされて記号が変わるため。
  service.addRule("articleBlock", {
    filter: (node) => node.nodeName === "DIV" && node.hasAttribute(ARTICLE_BLOCK_ATTR),
    replacement: (_content, node) => {
      const encoded = (node as Element).getAttribute(ARTICLE_BLOCK_SOURCE_ATTR) || "";
      let source = "";
      try {
        source = decodeURIComponent(encoded);
      } catch {
        source = "";
      }
      return source ? `\n\n${source}\n\n` : "";
    },
  });

  // turndown の既定は "-   項目"（記号のあと空白3つ）。一般的な記事は "- 項目" なので、
  // 1行直しただけでリスト全行に差分が出ないよう既存の書き方へ揃える。
  // 継続行のインデントは接頭辞と同じ幅にする（"1. " なら3つ）。ここを固定幅にすると
  // 番号付きリストの入れ子が壊れる。
  service.addRule("compactListItem", {
    filter: "li",
    replacement: (content, node, options) => {
      let prefix = `${options.bulletListMarker} `;
      const parent = node.parentNode as HTMLElement | null;
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
      const next = (node as HTMLElement).nextElementSibling;
      if (!next) return content;
      // 入れ子のリストが続く場合に空行を挟むと、外側のリストまで緩くなって余白が広がる
      if (next.nodeName === "UL" || next.nodeName === "OL") return `${content}\n`;
      return `${content}\n\n`;
    },
  });

  turndown = service;
  return service;
}

// 本文に生の HTML は書かせない方針（src/content/article-blocks.ts の冒頭コメント）。
// 公開側は remark-html の sanitize:true で生 HTML を落としているのに、管理画面のプレビューだけ
// marked の出力をそのまま dangerouslySetInnerHTML へ渡していたため、本文に仕込まれた
// <img src=x onerror=...> が記事を開いた管理者のセッションで動いてしまう状態だった。
// 公開側と同じ結果になるよう、html トークンを捨て、http(s)/mailto/tel 以外のスキームを外す。
// marked の共有インスタンスへ use() すると、同じページの他の利用者にも影響が出る。専用のインスタンスを持つ。

/** 先頭のスキーム部分。`javascript:` などを見つけるために使う。 */
const SCHEME_RE = /^[a-z][a-z0-9+.-]*:/i;

/** リンク・画像で通してよいスキーム。公開側（hast-util-sanitize の既定）に合わせる。 */
const SAFE_SCHEMES = new Set(["http:", "https:", "mailto:", "tel:"]);

/**
 * URL がスクリプトを起動しうるかどうかを見る。
 * ブラウザは href の中の HTML 実体参照を解いてから解釈するので（`&#106;avascript:` は `javascript:`）、
 * 判定の前に数値参照を戻し、空白・制御文字も落としてから確かめる。
 */
function isBlockedUrl(href: string): boolean {
  const normalized = href
    .replace(/[\u0000-\u0020\u007f]/g, "")
    .replace(/&#(\d+);?/g, (_m, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);?/gi, (_m, code: string) => String.fromCodePoint(parseInt(code, 16)));
  const scheme = SCHEME_RE.exec(normalized);
  // スキームが無いもの（相対パス・#見出し）はそのまま通す
  if (!scheme) return false;
  return !SAFE_SCHEMES.has(scheme[0].toLowerCase());
}

const previewMarked = new Marked(
  { async: false, gfm: true, breaks: false },
  {
    renderer: {
      // 生の HTML（ブロック・インラインとも）は出力しない
      html: () => "",
      link(token) {
        if (isBlockedUrl(token.href)) token.href = "";
        // false を返すと marked の既定の描画に任せられる
        return false;
      },
      image(token) {
        if (isBlockedUrl(token.href)) token.href = "";
        return false;
      },
    },
  }
);

export function markdownToHtml(markdown: string): string {
  if (!markdown.trim()) return "";
  return previewMarked.parse(markdown, { async: false }) as string;
}

/** 記事全体で集めた参照リンクの定義を使って、本文の一部を HTML にする。 */
function markdownToHtmlWithLinks(markdown: string, links: Links): string {
  if (!markdown.trim()) return "";
  const lexer = new previewMarked.Lexer(previewMarked.defaults);
  Object.assign(lexer.tokens.links, links);
  return previewMarked.parser(lexer.lex(markdown)) as string;
}

/** 装飾枠を記法どおりの原文に組み直す（開始行・中身・閉じ行）。 */
export function articleBlockSource(block: ArticleBlock): string {
  const open = block.arg ? `:::${block.name} ${block.arg}` : `:::${block.name}`;
  return [open, ...block.lines, ":::"].join("\n");
}

function escapeText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * 見たまま編集に渡す HTML を作る。
 *
 * markdownToHtml と違い、装飾枠（`:::callout` など）を段落にせず、原文を持った塊の要素にする。
 * 見たまま編集はこの要素を ArticleBlock として読み、保存時は htmlToMarkdown が原文へ戻す。
 * 閉じ忘れの枠は splitArticleContent が通常の Markdown として返すので、今までどおり段落になる。
 */
export function markdownToEditorHtml(markdown: string): string {
  if (!markdown.trim()) return "";
  // 参照形式のリンク・画像（`[資料][ref]` と、別の場所に書いた `[ref]: URL`）は、
  // 枠の前後で本文が分かれても解決できるよう、記事全体の定義を先に集めて各部分に渡す。
  const links = previewMarked.lexer(markdown).links;
  return splitArticleContent(markdown)
    .map((segment) => {
      if (segment.kind === "markdown") return markdownToHtmlWithLinks(segment.text, links);
      const source = articleBlockSource(segment);
      return (
        `<div ${ARTICLE_BLOCK_ATTR}="" ${ARTICLE_BLOCK_SOURCE_ATTR}="${encodeURIComponent(source)}">` +
        `${escapeText(source)}</div>`
      );
    })
    .join("\n");
}

/**
 * turndown を先に読み込んでおく。編集画面の表示時に呼んでおくと、
 * 最初の入力で変換が一拍待たされるのを避けられる。
 */
export async function preloadMarkdownConverter(): Promise<void> {
  await getTurndown();
}

export async function htmlToMarkdown(html: string): Promise<string> {
  if (!html.trim()) return "";
  const service = await getTurndown();
  return (
    service
      .turndown(html)
      // 空段落由来の3行以上の空行を詰める
      .replace(/\n{3,}/g, "\n\n")
      // turndown は行頭の "1. " を箇条書きと誤読されないようエスケープするが、
      // 見出し行（"## 1. まず〜"）では箇条書きになりようがないので元に戻す。
      // これを入れないと "## 1\. まず〜" というバックスラッシュが本文に残る。
      .replace(/^(#{1,6} .*)$/gm, (line) => line.replace(/(\d)\\\./g, "$1."))
      .trim()
  );
}

/**
 * リッチエディタとマークダウンを往復させたとき、意味が同じでも文字列が変わることがある
 * （空行の数、エスケープなど）。無用な差分で「未保存」判定が出ないよう、比較用に正規化する。
 */
export function normalizeMarkdown(markdown: string): string {
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
