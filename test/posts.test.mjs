// 新規記事の slug の決まり方の検証。
//
// 画面はタイトルを打つたびに slug 欄へ自動生成した値を入れ、保存でその値をそのまま送る。
// 送られた値を「利用者が決めた slug」として無条件に尊重すると、「3つのコツ」のような
// タイトルで slug が "3" になり、/post/3 という記事を表さない URL で公開されてしまう。

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { createSite } from "./support/harness.mjs";

/** 画面と同じ形で新規記事を作る。slug を省くと画面の自動生成と同じ値を送る。 */
function slugify(input) {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

async function createPost(site, session, title, slug) {
  const created = await site.call(site.handlers.postsCreate, {
    session,
    body: {
      title,
      slug: slug === undefined ? slugify(title) : slug,
      categorySlug: "",
      categoryLabel: "",
      bodyMarkdown: "本文",
    },
  });
  assert.equal(created.status, 201, JSON.stringify(created.json));
  return created.json.post.slug;
}

describe("新規記事の slug", () => {
  it("画面が自動生成した短すぎる slug は、そのまま使わず自動採番へ回す", async () => {
    const site = await createSite();
    const admin = await site.seedAdmin();

    // 画面はタイトル「3つのコツ」から slug 欄に "3" を入れて送ってくる。
    const slug = await createPost(site, admin.session, "3つのコツ");
    assert.notEqual(slug, "3");
    assert.match(slug, /^post-\d{8}-[0-9a-f]{6}$/);
  });

  it("日本語だけのタイトルも自動採番になる", async () => {
    const site = await createSite();
    const admin = await site.seedAdmin();

    const slug = await createPost(site, admin.session, "実家の片付けで出てくるもの");
    assert.match(slug, /^post-\d{8}-[0-9a-f]{6}$/);
  });

  it("英字を含む十分な長さのタイトルは、そのまま slug になる", async () => {
    const site = await createSite();
    const admin = await site.seedAdmin();

    const slug = await createPost(site, admin.session, "Kitchen renovation");
    assert.equal(slug, "kitchen-renovation");
  });

  it("利用者が自分で入れた slug は、短くても尊重する", async () => {
    const site = await createSite();
    const admin = await site.seedAdmin();

    // タイトルから作られる値（"3"）とは違う値を手で入れた場合。
    const slug = await createPost(site, admin.session, "3つのコツ", "kotsu");
    assert.equal(slug, "kotsu");
  });

  it("同じ slug が既にあるときは連番を付ける", async () => {
    const site = await createSite();
    const admin = await site.seedAdmin();

    assert.equal(await createPost(site, admin.session, "Kitchen renovation"), "kitchen-renovation");
    assert.equal(
      await createPost(site, admin.session, "Kitchen renovation"),
      "kitchen-renovation-2"
    );
  });
});
