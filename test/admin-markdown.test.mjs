// 編集画面のプレビューが本文をどう HTML に変えるかの検証。
//
// プレビューは変換結果を dangerouslySetInnerHTML でそのまま描く。本文は自動投稿でも入るので、
// 生の HTML がここを素通りすると、記事を開いた管理者のセッションでスクリプトが動いてしまう。
// 公開側は remark-html の sanitize:true で生 HTML を落としているので、同じ結果になることを確かめる。

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

const { markdownToHtml } = await import("../dist/ui/lib/admin-markdown.js");

describe("markdownToHtml", () => {
  it("ブロックの生 HTML を出力しない", () => {
    const html = markdownToHtml('あ\n\n<img src=x onerror="alert(1)">\n\nい');
    assert.equal(html.includes("onerror"), false);
    assert.equal(html.includes("<img"), false);
    assert.equal(html.includes("<p>あ</p>"), true);
    assert.equal(html.includes("<p>い</p>"), true);
  });

  it("段落の途中に混ぜたインラインの生 HTML も出力しない", () => {
    const html = markdownToHtml('本文の<b onclick="alert(1)">途中</b>です。');
    assert.equal(html.includes("onclick"), false);
    assert.equal(html.includes("<b"), false);
    assert.equal(html.includes("本文の途中です。"), true);
  });

  it("script タグを出力しない", () => {
    const html = markdownToHtml("<scr" + "ipt>alert(1)</scr" + "ipt>");
    assert.equal(html.toLowerCase().includes("<scr" + "ipt"), false);
  });

  it("javascript: のリンクは行き先を外す", () => {
    const html = markdownToHtml("[ここ](javascript:alert(1))");
    assert.equal(html.includes("javascript:"), false);
    assert.equal(html.includes("ここ"), true);
  });

  it("実体参照でごまかした javascript: も外す", () => {
    const html = markdownToHtml("[ここ](&#106;avascript:alert(1))");
    assert.equal(/&#106;avascript|javascript:/i.test(html), false);
  });

  it("data: の画像は行き先を外す", () => {
    const html = markdownToHtml("![図](data:text/html,abc)");
    assert.equal(html.includes("data:text/html"), false);
  });

  it("通常のリンク・画像・見出し・強調はそのまま出す", () => {
    const html = markdownToHtml(
      "## 見出し\n\n**太字** と [リンク](https://example.com/a) と ![図](/assets/a.png)\n\n- 箇条書き\n"
    );
    assert.equal(html.includes('<a href="https://example.com/a">リンク</a>'), true);
    assert.equal(html.includes('src="/assets/a.png"'), true);
    assert.equal(html.includes("<h2>見出し</h2>"), true);
    assert.equal(html.includes("<strong>太字</strong>"), true);
    assert.equal(html.includes("<li>箇条書き</li>"), true);
  });

  it("#リンク・mailto・tel は通す", () => {
    const html = markdownToHtml("[a](#midashi) [b](mailto:a@example.com) [c](tel:0120000000)");
    assert.equal(html.includes('href="#midashi"'), true);
    assert.equal(html.includes('href="mailto:a@example.com"'), true);
    assert.equal(html.includes('href="tel:0120000000"'), true);
  });

  it("空の本文は空文字を返す", () => {
    assert.equal(markdownToHtml("   \n  "), "");
  });
});

// 見たまま編集で装飾枠（:::callout など）が崩れないことの検証。
//
// 以前は枠が段落として見たまま編集に渡り、段落内の改行が空白に畳まれて、保存すると
// `:::callout 見出し 本文 :::` の1行に潰れていた（公開ページで枠として描かれなくなる）。
// 枠は原文を持った塊（ArticleBlock）として往復することを確かめる。

const { markdownToEditorHtml, htmlToMarkdown, normalizeMarkdown } = await import(
  "../dist/ui/lib/admin-markdown.js"
);
const { ArticleBlock } = await import("../dist/ui/lib/article-block-node.js");
const { generateJSON, generateHTML } = await import("@tiptap/html/server");
const { default: StarterKit } = await import("@tiptap/starter-kit");
const { default: Image } = await import("@tiptap/extension-image");

// 見たまま編集（RichTextEditor）と同じ拡張の組み合わせ
const editorExtensions = [
  StarterKit.configure({ heading: { levels: [2, 3] }, codeBlock: false }),
  Image.configure({ inline: false, allowBase64: false }),
  ArticleBlock,
];

const ARTICLE = [
  "会議で意見を求められて、話し始める。",
  "",
  ":::callout 今日の見方",
  "放送の現場でしていた準備を、口ぐせに当てはめます。",
  ":::",
  "",
  "## 見出し",
  "",
  "本文の段落です。[リンク](/blog/sample-post)も入れます。",
  "",
  ":::points",
  "場面 01 | 会議で急に指名されたとき。",
  "場面 02 | 質問を受けたとき。",
  ":::",
  "",
  ":::compare",
  "我慢して減らす | 言わないと決めて話し出す。",
  "置き換えて減らす | 息と間で待つ。",
  ":::",
  "",
  ":::stat 3秒",
  "吐き切るのにかけたい時間の目安",
  ":::",
  "",
  "締めの段落です。",
  "",
  ":::faq",
  "代わりに何と言えばいいですか？ | 息を吐いて待つほうをおすすめします。",
  "オンラインでも同じですか？ | 同じです。",
  ":::",
].join("\n");

/** 見たまま編集に読み込ませ、そのまま HTML に書き出させる（編集して保存したときと同じ経路） */
function throughEditor(html) {
  return generateHTML(generateJSON(html, editorExtensions), editorExtensions);
}

describe("見たまま編集と装飾枠", () => {
  it("枠は原文を持った塊の要素になる", () => {
    const html = markdownToEditorHtml(ARTICLE);
    assert.equal((html.match(/data-article-block=""/g) || []).length, 5);
    assert.equal(html.includes("<p>:::"), false);
  });

  it("Markdown → 見たまま編集の HTML → Markdown の往復で枠が崩れない", async () => {
    const back = await htmlToMarkdown(markdownToEditorHtml(ARTICLE));
    assert.equal(normalizeMarkdown(back), normalizeMarkdown(ARTICLE));
  });

  it("見たまま編集に読み込ませて書き出しても枠が崩れない", async () => {
    const back = await htmlToMarkdown(throughEditor(markdownToEditorHtml(ARTICLE)));
    assert.equal(normalizeMarkdown(back), normalizeMarkdown(ARTICLE));
    // 以前の不具合の形（開始と閉じが同じ行）になっていない
    assert.equal(/:::callout[^\n]*:::/.test(back), false);
  });

  it("枠の中の記号・改行・絵文字をそのまま運ぶ", async () => {
    const source = [
      ":::callout 「引用」と \"二重引用\"",
      "A & B <b>太字</b> | 区切り 😊",
      "2行目",
      ":::",
    ].join("\n");
    const back = await htmlToMarkdown(throughEditor(markdownToEditorHtml(source)));
    assert.equal(normalizeMarkdown(back), normalizeMarkdown(source));
  });

  it("枠の原文に HTML を仕込んでも要素として出さない", () => {
    const html = markdownToEditorHtml(':::callout "><img src=x onerror=alert(1)>\n本文\n:::');
    // 原文は文字としてエスケープされ、属性からもはみ出さない
    assert.equal(html.includes("<img"), false);
    assert.equal(html.includes('"><'), false);
    // 見たまま編集に読ませても画像の要素にはならない
    const json = generateJSON(html, editorExtensions);
    assert.equal(JSON.stringify(json).includes('"type":"image"'), false);
  });

  it("枠の前後に分かれた参照形式のリンク・画像も解決する", async () => {
    const md = [
      "[参考資料][ref] と ![写真][photo]",
      "",
      ":::callout 注意",
      "本文",
      ":::",
      "",
      "[ref]: https://example.com/docs",
      "[photo]: https://example.com/photo.webp",
    ].join("\n");
    const html = markdownToEditorHtml(md);
    assert.equal(html.includes('<a href="https://example.com/docs">参考資料</a>'), true);
    assert.equal(html.includes('src="https://example.com/photo.webp"'), true);
    // 見たまま編集を通して保存しても、リンクと画像が残る（定義はインラインの形に変わる）
    const back = await htmlToMarkdown(throughEditor(html));
    assert.equal(back.includes("[参考資料](https://example.com/docs)"), true);
    assert.equal(back.includes("https://example.com/photo.webp"), true);
    assert.equal(/:::callout 注意\n本文\n:::/.test(back), true);
  });

  it("閉じ忘れの枠は今までどおり通常の段落として扱う", () => {
    const html = markdownToEditorHtml(":::callout 見出し\n本文だけで閉じていない");
    assert.equal(html.includes("data-article-block"), false);
    assert.equal(html.includes("本文だけで閉じていない"), true);
  });

  it("空の本文は空文字を返す", () => {
    assert.equal(markdownToEditorHtml("  \n "), "");
  });
});
