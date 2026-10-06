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

  it("動画の枠も塊になり、見たまま編集を通しても URL が崩れない", async () => {
    const source = [
      "動画で紹介します。",
      "",
      ":::youtube",
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s",
      ":::",
      "",
      "続きの段落です。",
    ].join("\n");
    const html = markdownToEditorHtml(source);
    assert.equal((html.match(/data-article-block=""/g) || []).length, 1);
    // 見たまま編集に渡す段階では iframe を作らない（原文を文字として持つだけ）
    assert.equal(html.includes("<iframe"), false);
    const back = await htmlToMarkdown(throughEditor(html));
    assert.equal(normalizeMarkdown(back), normalizeMarkdown(source));
  });

  it("空の本文は空文字を返す", () => {
    assert.equal(markdownToEditorHtml("  \n "), "");
  });
});

// 表も枠と同じく原文を持った塊にする。見たまま編集に表の部品が無いため、
// 何もしないと表はセルの文字だけが1段落に連結され、保存すると表が消える（2026-10-06 に発生）。

// 不具合が出た記事と同じ並び（枠の直後に表、表の直後に見出し）
const ARTICLE_WITH_TABLE = [
  "書き出しの段落です。",
  "",
  ":::callout 先に結論",
  "準備から本番までは、次の順番で進めます。",
  ":::",
  "",
  "| 工程 | やること | 目安 |",
  "| --- | --- | --- |",
  "| 準備 | 資料を机に並べる | 5分ほど |",
  "| 話す | 最初の一言を決めておく | 30秒以内 |",
  "",
  "## 準備を始める合図は？",
  "",
  "本文の段落です。[関連の記事](/blog/sample-post)も入れます。",
  "",
  "| 確かめること | 確かめ方 |",
  "| :--- | ---: |",
  "| 長さ | 3分・5分 |",
  "",
  ":::points",
  "場面 01 | 会議で急に指名されたとき。",
  ":::",
].join("\n");

describe("見たまま編集と表", () => {
  it("表は原文を持った塊の要素になり、table 要素のまま見たまま編集に渡さない", () => {
    const html = markdownToEditorHtml(ARTICLE_WITH_TABLE);
    // 枠2つ＋表2つ
    assert.equal((html.match(/data-article-block=""/g) || []).length, 4);
    assert.equal(html.includes("<table"), false);
    // 表以外の本文は今までどおり HTML になる
    assert.equal(html.includes("<h2>準備を始める合図は？</h2>"), true);
    assert.equal(html.includes('<a href="/blog/sample-post">関連の記事</a>'), true);
  });

  it("見たまま編集に読み込ませて書き出しても表が崩れない", async () => {
    const back = await htmlToMarkdown(throughEditor(markdownToEditorHtml(ARTICLE_WITH_TABLE)));
    assert.equal(normalizeMarkdown(back), normalizeMarkdown(ARTICLE_WITH_TABLE));
    // 以前の不具合の形（セルの文字が1行に連結）になっていない
    assert.equal(back.includes("工程やること目安"), false);
  });

  it("表のセルのリンク・記号・エスケープした縦線をそのまま運ぶ", async () => {
    const source = [
      "| 項目 | 内容 |",
      "| --- | --- |",
      "| A & B | <b>太字</b> と a \\| b |",
      "| 外部 | [公式の案内](https://example.com/a?x=1&y=2) |",
    ].join("\n");
    const back = await htmlToMarkdown(throughEditor(markdownToEditorHtml(source)));
    assert.equal(normalizeMarkdown(back), normalizeMarkdown(source));
  });

  it("表の原文に HTML を仕込んでも要素として出さない", () => {
    const html = markdownToEditorHtml('| a | b |\n| --- | --- |\n| "><img src=x onerror=alert(1)> | c |');
    assert.equal(html.includes("<img"), false);
    assert.equal(html.includes('"><'), false);
    const json = generateJSON(html, editorExtensions);
    assert.equal(JSON.stringify(json).includes('"type":"image"'), false);
  });

  it("表の前後に分かれた参照形式のリンクも解決する", () => {
    const md = [
      "[参考資料][ref] を見てください。",
      "",
      "| a | b |",
      "| --- | --- |",
      "| 1 | 2 |",
      "",
      "[ref]: https://example.com/docs",
    ].join("\n");
    const html = markdownToEditorHtml(md);
    assert.equal(html.includes('<a href="https://example.com/docs">参考資料</a>'), true);
    assert.equal((html.match(/data-article-block=""/g) || []).length, 1);
  });

  it("表のセルの参照形式のリンク・画像は、表の外の定義ごと運ぶ", async () => {
    const md = [
      "| 項目 | 内容 |",
      "| --- | --- |",
      "| 資料 | [説明][Ref] と [doc] |",
      "| 写真 | ![写真][photo] |",
      "",
      "本文の段落です。",
      "",
      "[ref]: https://example.com/docs \"資料の題\"",
      "[doc]: https://example.com/doc",
      "[photo]: https://example.com/photo.webp",
      "[unused]: https://example.com/unused",
    ].join("\n");
    const back = await htmlToMarkdown(throughEditor(markdownToEditorHtml(md)));
    // 保存した本文を公開側と同じく HTML にしても、表の中のリンクと画像の行き先が残る
    const html = markdownToHtml(back);
    assert.equal(html.includes('<a href="https://example.com/docs" title="資料の題">説明</a>'), true);
    assert.equal(html.includes('<a href="https://example.com/doc">doc</a>'), true);
    assert.equal(html.includes('src="https://example.com/photo.webp"'), true);
    assert.equal(back.includes("[説明][Ref]"), true);
    // 表で使っていない定義までは運ばない
    assert.equal(back.includes("example.com/unused"), false);
  });

  it("表の外の定義は書き直さず原文のまま運ぶ（エスケープや <> 囲みで行き先が変わらない）", async () => {
    const md = [
      "| a | b |",
      "| --- | --- |",
      "| [一][esc] | [二][space] |",
      "",
      "[esc]: https://example.com/a\\\\.b",
      "[space]: <https://example.com/x y> '単引用の題'",
    ].join("\n");
    const back = await htmlToMarkdown(throughEditor(markdownToEditorHtml(md)));
    const hrefs = (html) => [...html.matchAll(/<a [^>]*>/g)].map((m) => m[0]);
    // 保存前と保存後で、公開側の HTML のリンクが1文字も変わらない
    assert.deepEqual(hrefs(markdownToHtml(back)), hrefs(markdownToHtml(md)));
    assert.equal(back.includes("[esc]: https://example.com/a\\\\.b"), true);
  });

  it("表のカードの原文は、それだけで参照形式のリンクが解決できる", () => {
    const md = ["| a |", "| --- |", "| [説明][ref] |", "", "[ref]: https://example.com/docs"].join("\n");
    const match = /data-source="([^"]*)"/.exec(markdownToEditorHtml(md));
    const source = decodeURIComponent(match?.[1] ?? "");
    assert.equal(markdownToHtml(source).includes('<a href="https://example.com/docs">説明</a>'), true);
  });
});
