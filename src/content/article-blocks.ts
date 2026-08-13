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
export const ARTICLE_BLOCK_NAMES = [
  "callout",
  "points",
  "compare",
  "stat",
  "faq",
] as const;

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

const OPEN_RE = /^:::([a-z]+)[ 　]*(.*)$/;
const CLOSE_RE = /^:::[ 　]*$/;

function isBlockName(value: string): value is ArticleBlockName {
  return (ARTICLE_BLOCK_NAMES as readonly string[]).includes(value);
}

/**
 * 本文を「通常の Markdown」と「ブロック」に切り分ける。
 * 閉じ忘れたブロックは、そのまま Markdown として扱う（記事が消えるより崩れて見えるほうがよい）。
 */
export function splitArticleContent(markdown: string): ArticleSegment[] {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const segments: ArticleSegment[] = [];
  let buffer: string[] = [];

  const flush = () => {
    const text = buffer.join("\n");
    if (text.trim()) segments.push({ kind: "markdown", text });
    buffer = [];
  };

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? "";
    const open = OPEN_RE.exec(line.trim());
    if (!open || !isBlockName(open[1] ?? "")) {
      buffer.push(line);
      continue;
    }

    // 閉じ行を探す。見つからなければブロックとして扱わない。
    let end = -1;
    for (let j = i + 1; j < lines.length; j += 1) {
      if (CLOSE_RE.test((lines[j] ?? "").trim())) {
        end = j;
        break;
      }
    }
    if (end === -1) {
      buffer.push(line);
      continue;
    }

    flush();
    segments.push({
      kind: "block",
      name: open[1] as ArticleBlockName,
      arg: (open[2] ?? "").trim(),
      lines: lines
        .slice(i + 1, end)
        .map((l) => l.trim())
        .filter(Boolean),
    });
    i = end;
  }

  flush();
  return segments;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * ブロック内で使える最小限の装飾。
 * リンクは http/https のみ、強調は `**...**` のみ。それ以外はただの文字として出す。
 */
function inline(value: string): string {
  let out = escapeHtml(value);
  out = out.replace(
    /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
    (_m, text: string, href: string) =>
      `<a href="${href}" target="_blank" rel="noopener">${text}</a>`
  );
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  return out;
}

/** `ラベル | 本文` を分解する。区切りが無い行はラベル無しとして扱う。 */
function splitPair(line: string): { label: string; text: string } {
  const index = line.indexOf("|");
  if (index === -1) return { label: "", text: line.trim() };
  return {
    label: line.slice(0, index).trim(),
    text: line.slice(index + 1).trim(),
  };
}

// 要点を示すコールアウトのアイコン。外部ライブラリを増やさないためインラインで持つ。
const CALLOUT_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
  'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<path d="M4 7h16"/><path d="M4 12h16"/><path d="M4 17h10"/></svg>';

/** ブロック1つを HTML にする。中身は必ずエスケープ済み。 */
export function renderArticleBlock(block: ArticleBlock): string {
  const { name, arg, lines } = block;

  if (name === "callout") {
    const heading = arg ? `<strong>${inline(arg)}</strong>` : "";
    const body = lines.map((l) => inline(l)).join("<br>");
    return (
      '<div class="blog-callout">' +
      `<div class="blog-callout-icon">${CALLOUT_ICON}</div>` +
      `<div class="blog-callout-text">${heading}${body}</div>` +
      "</div>"
    );
  }

  if (name === "points") {
    const items = lines
      .map((line) => {
        const { label, text } = splitPair(line);
        const labelHtml = label
          ? `<span class="blog-point-label">${inline(label)}</span>`
          : "";
        return `<div class="blog-point">${labelHtml}<p class="blog-point-text">${inline(text)}</p></div>`;
      })
      .join("");
    return `<div class="blog-points">${items}</div>`;
  }

  if (name === "compare") {
    // 1枚目を「いまの状態」、2枚目以降を「こうする」として色を変える。
    const cards = lines
      .map((line, index) => {
        const { label, text } = splitPair(line);
        const cls = index === 0 ? "blog-compare-card" : "blog-compare-card is-after";
        const labelHtml = label
          ? `<div class="blog-compare-label">${inline(label)}</div>`
          : "";
        return `<div class="${cls}">${labelHtml}<div class="blog-compare-text">${inline(text)}</div></div>`;
      })
      .join("");
    return `<div class="blog-compare">${cards}</div>`;
  }

  if (name === "stat") {
    const text = lines.map((l) => inline(l)).join(" ");
    return (
      '<div class="blog-stat">' +
      `<span class="blog-stat-number">${inline(arg)}</span>` +
      `<span class="blog-stat-text">${text}</span>` +
      "</div>"
    );
  }

  // faq
  const heading = arg || "よくある質問";
  const items = lines
    .map((line) => {
      const { label, text } = splitPair(line);
      const question = label || text;
      const answer = label ? text : "";
      return `<details><summary>${inline(question)}</summary><div>${inline(answer)}</div></details>`;
    })
    .join("");
  return `<section class="blog-faq"><h2>${inline(heading)}</h2>${items}</section>`;
}

/**
 * 本文を HTML にする。通常の Markdown 部分の変換だけ呼び出し側から渡す。
 *
 * 変換器をこのパッケージに持たないのは、公開側（remark など）と編集画面（marked）で
 * 使うライブラリが違うため。ブロックの見た目だけをここで揃える。
 */
export function renderArticleHtml(
  markdown: string,
  renderMarkdown: (source: string) => string
): string {
  return splitArticleContent(markdown)
    .map((segment) =>
      segment.kind === "block"
        ? renderArticleBlock(segment)
        : renderMarkdown(segment.text)
    )
    .join("\n");
}

/**
 * 非同期の Markdown 変換器（remark など）向け。
 * 中身は renderArticleHtml と同じ。
 */
export async function renderArticleHtmlAsync(
  markdown: string,
  renderMarkdown: (source: string) => Promise<string>
): Promise<string> {
  const parts = await Promise.all(
    splitArticleContent(markdown).map(async (segment) =>
      segment.kind === "block"
        ? renderArticleBlock(segment)
        : await renderMarkdown(segment.text)
    )
  );
  return parts.join("\n");
}
