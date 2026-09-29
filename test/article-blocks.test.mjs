// 本文の動画の枠（:::youtube）の検証。
//
// 公開側は枠の HTML をサニタイズせずにそのまま出す。本文に書いた文字が iframe の属性へ
// 入り込まないこと、決まった形の URL から取り出した動画 ID だけで組み立てることを確かめる。

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

const { renderArticleHtml, splitArticleContent, youtubeVideoId } = await import(
  "../dist/content/article-blocks.js"
);

const ID = "dQw4w9WgXcQ";
const EMBED = `src="https://www.youtube-nocookie.com/embed/${ID}"`;
const plain = (source) => `<p>${source.trim()}</p>`;

describe("youtubeVideoId", () => {
  it("watch・youtu.be・shorts の3つの形から ID を取り出す", () => {
    assert.equal(youtubeVideoId(`https://www.youtube.com/watch?v=${ID}`), ID);
    assert.equal(youtubeVideoId(`https://youtube.com/watch?v=${ID}&t=42s`), ID);
    assert.equal(youtubeVideoId(`https://m.youtube.com/watch?feature=share&v=${ID}`), ID);
    assert.equal(youtubeVideoId(`https://youtu.be/${ID}?si=abcdef`), ID);
    assert.equal(youtubeVideoId(`https://www.youtube.com/shorts/${ID}`), ID);
  });

  it("スキームが落ちた形と前後の空白も受ける", () => {
    assert.equal(youtubeVideoId(`  youtu.be/${ID}  `), ID);
    assert.equal(youtubeVideoId(`www.youtube.com/watch?v=${ID}`), ID);
  });

  it("YouTube 以外・形の違う ID・壊れた URL は null", () => {
    assert.equal(youtubeVideoId(`https://example.com/watch?v=${ID}`), null);
    assert.equal(youtubeVideoId(`https://youtube.com.example.com/watch?v=${ID}`), null);
    assert.equal(youtubeVideoId("https://www.youtube.com/watch?v=short"), null);
    assert.equal(youtubeVideoId(`https://www.youtube.com/watch?v=${ID}x`), null);
    assert.equal(youtubeVideoId(`https://www.youtube.com/channel/${ID}`), null);
    assert.equal(youtubeVideoId("javascript:alert(1)"), null);
    assert.equal(youtubeVideoId(""), null);
  });
});

describe(":::youtube の枠", () => {
  it("youtube-nocookie の iframe を 16:9 の枠に入れて出す", () => {
    const html = renderArticleHtml(`:::youtube\nhttps://www.youtube.com/watch?v=${ID}\n:::`, plain);
    assert.equal(html.includes(EMBED), true);
    assert.equal(html.includes('loading="lazy"'), true);
    assert.equal(html.includes('title="YouTube 動画"'), true);
    assert.equal(html.includes("aspect-ratio:16/9"), true);
    assert.equal(html.includes("width:100%"), true);
    assert.equal((html.match(/<iframe/g) || []).length, 1);
  });

  it("前後の本文はそのまま Markdown として渡す", () => {
    const html = renderArticleHtml(
      `前の段落\n\n:::youtube\nhttps://youtu.be/${ID}\n:::\n\n後の段落`,
      plain
    );
    assert.equal(html.startsWith("<p>前の段落</p>"), true);
    assert.equal(html.endsWith("<p>後の段落</p>"), true);
    assert.equal(html.includes(EMBED), true);
  });

  it("開始行に書いた URL も受ける", () => {
    const html = renderArticleHtml(`:::youtube https://youtu.be/${ID}\n:::`, plain);
    assert.equal(html.includes(EMBED), true);
  });

  it("ID が取り出せなければ何も出さない", () => {
    for (const body of ["https://example.com/video", "動画はこちら", ""]) {
      const html = renderArticleHtml(`:::youtube\n${body}\n:::`, plain);
      assert.equal(html, "");
    }
  });

  it("URL に仕込んだ文字は出力に入らない", () => {
    const html = renderArticleHtml(
      `:::youtube\nhttps://www.youtube.com/watch?v=${ID}&x="><script>alert(1)</script>\n:::`,
      plain
    );
    assert.equal(html.includes("<script"), false);
    assert.equal(html.includes("alert"), false);
    assert.equal(html.includes(EMBED), true);
  });

  it("URL だけの行は枠で囲まない限り今までどおり本文のまま", () => {
    const html = renderArticleHtml(`https://www.youtube.com/watch?v=${ID}`, plain);
    assert.equal(html, `<p>https://www.youtube.com/watch?v=${ID}</p>`);
    assert.equal(splitArticleContent(`https://youtu.be/${ID}`)[0].kind, "markdown");
  });
});

describe("ArticleBody と動画の枠", async () => {
  const { createElement } = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { ArticleBody } = await import("../dist/ui/ArticleBody.js");
  const render = (content) =>
    renderToStaticMarkup(
      createElement(ArticleBody, {
        content,
        renderMarkdown: (source) => createElement("p", null, source.trim()),
      })
    );

  it("動画の枠を iframe にして出す", () => {
    const html = render(`前\n\n:::youtube\nhttps://youtu.be/${ID}\n:::\n\n後`);
    assert.equal(html.includes(EMBED), true);
  });

  it("URL を読み取れない枠は空の div も残さない", () => {
    const html = render("前\n\n:::youtube\nhttps://example.com/video\n:::\n\n後");
    assert.equal(html, "<p>前</p><p>後</p>");
  });
});
