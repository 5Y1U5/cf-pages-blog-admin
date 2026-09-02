// 公開処理の状態遷移の検証。
//
// 確かめたいのは「失敗したときに、記事の状態表示がサイトの実態と食い違わない」こと。
// 公開中の記事を公開し直して失敗すると、記事はサイトに出たままなので、
// 状態も公開中のまま残っていないと一覧の表示が実態とずれる。

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { createSite } from "./support/harness.mjs";

async function statusOf(site, id) {
  const row = await site.db
    .prepare("SELECT status, published_url FROM post_drafts WHERE id = ?")
    .bind(id)
    .first();
  return row;
}

async function addAndPublish(site, session, title) {
  await site.call(site.handlers.categoriesCreate, {
    session,
    body: { slug: "column", label: "ブログ" },
  });
  const created = await site.call(site.handlers.postsCreate, {
    session,
    body: { title, categorySlug: "column", categoryLabel: "ブログ", bodyMarkdown: "本文" },
  });
  assert.equal(created.status, 201);
  const id = created.json.post.id;
  const published = await site.call(site.handlers.postPublish, {
    session,
    method: "POST",
    params: { id },
    body: {},
  });
  assert.equal(published.status, 200, JSON.stringify(published.json));
  return id;
}

describe("公開の失敗時に戻す状態", () => {
  it("公開中の記事を公開し直して失敗しても、公開中のまま残る", async () => {
    const site = await createSite();
    const admin = await site.seedAdmin();
    const id = await addAndPublish(site, admin.session, "Kitchen renovation");
    assert.equal((await statusOf(site, id)).status, "published");

    // 自動投稿などが公開済みの記事へもう一度 publish を投げ、GitHub 側で失敗する場合。
    site.github.failWrites = true;
    const failed = await site.call(site.handlers.postPublish, {
      session: admin.session,
      method: "POST",
      params: { id },
      body: {},
    });
    assert.equal(failed.status, 500);

    // 記事はサイトに出たままなので、状態も公開中のまま。承認済みへ落とすと一覧の表示が実態とずれる。
    const after = await statusOf(site, id);
    assert.equal(after.status, "published");
    assert.ok(after.published_url);
  });

  it("下書きの公開に失敗したら、下書きへ戻る", async () => {
    const site = await createSite();
    const admin = await site.seedAdmin();
    await site.call(site.handlers.categoriesCreate, {
      session: admin.session,
      body: { slug: "column", label: "ブログ" },
    });
    const created = await site.call(site.handlers.postsCreate, {
      session: admin.session,
      body: {
        title: "Bathroom remodel",
        categorySlug: "column",
        categoryLabel: "ブログ",
        bodyMarkdown: "本文",
      },
    });
    const id = created.json.post.id;
    assert.equal((await statusOf(site, id)).status, "draft");

    site.github.failWrites = true;
    const failed = await site.call(site.handlers.postPublish, {
      session: admin.session,
      method: "POST",
      params: { id },
      body: {},
    });
    assert.equal(failed.status, 500);
    const after = await statusOf(site, id);
    assert.equal(after.status, "draft");
    assert.equal(after.published_url, null);
  });
});
