// 予約公開（publish.scheduledPublish）の検証。
//
// 確かめたいのは2つ。予約公開を使わないサイトの挙動が変わらない（未来日の公開は止まる）こと。
// 使うサイトでは未来日の公開が「予約」として通り、取り消すと下書きに戻ること。
// 公開ページに出すかどうかは公開側が todayInConfiguredZone で絞るので、その日付の境目も確かめる。

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { createSite, loadConfig } from "./support/harness.mjs";

const { isScheduledPost, todayInConfiguredZone } = await import("../dist/config/index.js");

/** 日本時間で見た今日から days 日ずらした日付（YYYY-MM-DD）。 */
function jstDate(days) {
  return new Date(Date.now() + 9 * 3600_000 + days * 86400_000).toISOString().slice(0, 10);
}

async function addPost(site, session, date) {
  await site.call(site.handlers.categoriesCreate, {
    session,
    body: { slug: "column", label: "ブログ" },
  });
  const created = await site.call(site.handlers.postsCreate, {
    session,
    body: {
      title: "Scheduled post",
      date,
      categorySlug: "column",
      categoryLabel: "ブログ",
      bodyMarkdown: "本文",
    },
  });
  assert.equal(created.status, 201, JSON.stringify(created.json));
  return created.json.post.id;
}

async function publish(site, session, id) {
  return site.call(site.handlers.postPublish, { session, method: "POST", params: { id }, body: {} });
}

async function rowOf(site, id) {
  return site.db
    .prepare("SELECT status, date, published_url FROM post_drafts WHERE id = ?")
    .bind(id)
    .first();
}

describe("予約公開を使わないサイト（既定）", () => {
  it("未来日の公開は今までどおり止める", async () => {
    const site = await createSite();
    const admin = await site.seedAdmin();
    const id = await addPost(site, admin.session, jstDate(2));
    const result = await publish(site, admin.session, id);
    assert.equal(result.status, 400);
    assert.match(result.json.message, /未来の日付/);
    assert.equal((await rowOf(site, id)).status, "draft");
  });
});

describe("予約公開を使うサイト", () => {
  const config = { publish: { scheduledPublish: true } };

  it("未来日の公開を予約として受け付け、公開日はそのまま残す", async () => {
    const site = await createSite({ config });
    const admin = await site.seedAdmin();
    const date = jstDate(2);
    const id = await addPost(site, admin.session, date);
    const result = await publish(site, admin.session, id);
    assert.equal(result.status, 200, JSON.stringify(result.json));
    const row = await rowOf(site, id);
    assert.equal(row.status, "published");
    assert.equal(row.date, date);
    assert.ok(row.published_url);
    assert.equal(isScheduledPost(site.config, row), true);
    // 操作ログにも予約だと分かる形で残す
    const log = await site.db
      .prepare("SELECT summary FROM audit_logs WHERE action = 'post.publish' LIMIT 1")
      .first();
    assert.match(log.summary, new RegExp(`${date} に予約`));
  });

  it("今日の日付なら通常の公開になる", async () => {
    const site = await createSite({ config });
    const admin = await site.seedAdmin();
    const id = await addPost(site, admin.session, jstDate(0));
    const result = await publish(site, admin.session, id);
    assert.equal(result.status, 200);
    assert.equal(isScheduledPost(site.config, await rowOf(site, id)), false);
  });

  it("予約を取り消すと下書きに戻る", async () => {
    const site = await createSite({ config });
    const admin = await site.seedAdmin();
    const id = await addPost(site, admin.session, jstDate(3));
    assert.equal((await publish(site, admin.session, id)).status, 200);
    const cancelled = await site.call(site.handlers.postUnpublish, {
      session: admin.session,
      method: "POST",
      params: { id },
      body: {},
    });
    assert.equal(cancelled.status, 200);
    const row = await rowOf(site, id);
    assert.equal(row.status, "draft");
    assert.equal(row.published_url, null);
    assert.equal(isScheduledPost(site.config, row), false);
  });
});

describe("予約中かどうかの判定", () => {
  // 2026-09-29 15:30（世界標準時）＝ 日本時間 2026-09-30 0:30
  const now = Date.UTC(2026, 8, 29, 15, 30);

  it("今日は設定のタイムゾーン（既定は日本時間）で数える", async () => {
    const config = await loadConfig();
    assert.equal(todayInConfiguredZone(config, now), "2026-09-30");
    assert.equal(todayInConfiguredZone(config, Date.UTC(2026, 8, 29, 14, 59)), "2026-09-29");
  });

  it("公開日の0時を過ぎたら予約中ではなくなる", async () => {
    const config = await loadConfig({ publish: { scheduledPublish: true } });
    const published = (date) => ({ status: "published", date });
    assert.equal(isScheduledPost(config, published("2026-09-30"), now), false);
    assert.equal(isScheduledPost(config, published("2026-10-01"), now), true);
    // 時刻付きの公開日でも日付の部分で比べる
    assert.equal(isScheduledPost(config, published("2026-09-30T09:00:00+09:00"), now), false);
    assert.equal(isScheduledPost(config, published("2026-10-01T00:00:00+09:00"), now), true);
  });

  it("公開していない記事と、予約公開を使わないサイトでは常に予約中ではない", async () => {
    const on = await loadConfig({ publish: { scheduledPublish: true } });
    const off = await loadConfig();
    assert.equal(isScheduledPost(on, { status: "draft", date: "2026-10-01" }, now), false);
    assert.equal(isScheduledPost(off, { status: "published", date: "2026-10-01" }, now), false);
  });
});

describe("予約中の記事と旧 URL の転送", () => {
  it("公開日が来るまで、旧 URL から予約中の記事へは転送しない", async () => {
    const site = await createSite({ config: { publish: { scheduledPublish: true } } });
    const admin = await site.seedAdmin();
    const { resolvePostRedirect } = await import("../dist/server/public/slug-redirect.js");
    const id = await addPost(site, admin.session, jstDate(0));
    assert.equal((await publish(site, admin.session, id)).status, 200);
    const oldPath = (await rowOf(site, id)).published_url;

    // slug を変え、公開日を先にして予約し直す
    const saved = await site.call(site.handlers.postPut, {
      session: admin.session,
      method: "PUT",
      params: { id },
      body: {
        title: "Scheduled post",
        slug: "scheduled-post-renamed",
        date: jstDate(2),
        categorySlug: "column",
        categoryLabel: "ブログ",
        bodyMarkdown: "本文",
      },
    });
    assert.equal(saved.status, 200, JSON.stringify(saved.json));
    assert.equal((await publish(site, admin.session, id)).status, 200);
    assert.equal(await resolvePostRedirect(site.db, site.config, oldPath), null);

    // 公開日が今日になれば転送する
    await site.db.prepare("UPDATE post_drafts SET date = ? WHERE id = ?").bind(jstDate(0), id).run();
    assert.equal(
      await resolvePostRedirect(site.db, site.config, oldPath),
      "/blog/scheduled-post-renamed"
    );
  });
});

describe("旧 URL で別の記事を予約したとき", () => {
  it("公開日が来るまでは旧 URL から元の記事へ転送し続け、来たら予約した記事を出す", async () => {
    const site = await createSite({ config: { publish: { scheduledPublish: true } } });
    const admin = await site.seedAdmin();
    const { resolvePostRedirect } = await import("../dist/server/public/slug-redirect.js");
    await site.call(site.handlers.categoriesCreate, {
      session: admin.session,
      body: { slug: "column", label: "ブログ" },
    });
    const create = async (slug, date) => {
      const created = await site.call(site.handlers.postsCreate, {
        session: admin.session,
        body: { title: slug, slug, date, categorySlug: "column", categoryLabel: "ブログ", bodyMarkdown: "本文" },
      });
      assert.equal(created.status, 201, JSON.stringify(created.json));
      return created.json.post.id;
    };

    // 元の記事を公開してから slug を変える（/blog/old-url → /blog/new-url の転送ができる）
    const first = await create("old-url", jstDate(0));
    assert.equal((await publish(site, admin.session, first)).status, 200);
    const renamed = await site.call(site.handlers.postPut, {
      session: admin.session,
      method: "PUT",
      params: { id: first },
      body: { title: "old-url", slug: "new-url", date: jstDate(0), categorySlug: "column", categoryLabel: "ブログ", bodyMarkdown: "本文" },
    });
    assert.equal(renamed.status, 200, JSON.stringify(renamed.json));
    assert.equal(await resolvePostRedirect(site.db, site.config, "/blog/old-url"), "/blog/new-url");

    // 空いた /blog/old-url で別の記事を予約しても、転送は消えない
    const second = await create("old-url", jstDate(2));
    assert.equal((await publish(site, admin.session, second)).status, 200);
    assert.equal(await resolvePostRedirect(site.db, site.config, "/blog/old-url"), "/blog/new-url");

    // 予約した記事の公開日が来たら、その URL は予約した記事のものになり転送しない
    await site.db.prepare("UPDATE post_drafts SET date = ? WHERE id = ?").bind(jstDate(0), second).run();
    assert.equal(await resolvePostRedirect(site.db, site.config, "/blog/old-url"), null);
  });
});
