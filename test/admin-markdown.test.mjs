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
