// 既存記事の slug 変更の検証。
//
// 確かめたいのは3つ。公開済みの記事は「旧 URL から新 URL へ転送される」「GitHub の Markdown が
// 新しいパスへ動く（旧パスは残らない）」こと、そして転送表が無いサイトや GitHub が落ちている
// ときでも、保存が黙って壊れないこと。

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { createSite } from "./support/harness.mjs";

const dist = (path) => import(`../dist/${path}.js`);

async function createPost(site, session, title, slug) {
  await site.call(site.handlers.categoriesCreate, {
    session,
    body: { slug: "column", label: "ブログ" },
  }).catch(() => undefined);
  const created = await site.call(site.handlers.postsCreate, {
    session,
    body: { title, slug, categorySlug: "column", categoryLabel: "ブログ", bodyMarkdown: "本文" },
  });
  assert.equal(created.status, 201, JSON.stringify(created.json));
  return created.json.post;
}

async function publishPost(site, session, id) {
  const published = await site.call(site.handlers.postPublish, {
    session,
    method: "POST",
    params: { id },
    body: {},
  });
  assert.equal(published.status, 200, JSON.stringify(published.json));
  return published.json;
}

/** 画面と同じ形で既存記事を保存する。slug 以外は変えない。 */
async function savePost(site, session, id, slug) {
  return site.call(site.handlers.postPut, {
    session,
    method: "PUT",
    params: { id },
    body: {
      title: "Kitchen renovation",
      slug,
      categorySlug: "column",
      categoryLabel: "ブログ",
      bodyMarkdown: "本文",
    },
  });
}

async function rowOf(site, id) {
  return site.db
    .prepare("SELECT slug, status, published_url, source_path FROM post_drafts WHERE id = ?")
    .bind(id)
    .first();
}

async function redirectsOf(site) {
  const { results } = await site.db
    .prepare("SELECT post_id, from_path FROM post_redirects ORDER BY created_at")
    .all();
  // node:sqlite の行は prototype が無いので、deepEqual で比べられる形に写す。
  return results.map((row) => ({ post_id: row.post_id, from_path: row.from_path }));
}

describe("既存記事の slug 変更", () => {
  it("下書きの slug は変わる。転送表には残らず、GitHub にも触らない", async () => {
    const site = await createSite();
    const admin = await site.seedAdmin();
    const post = await createPost(site, admin.session, "Kitchen renovation");
    assert.equal(post.slug, "kitchen-renovation");
    const callsBefore = site.github.calls.length;

    const saved = await savePost(site, admin.session, post.id, "kitchen-remodel");
    assert.equal(saved.status, 200, JSON.stringify(saved.json));
    assert.equal(saved.json.slug, "kitchen-remodel");
    assert.equal(saved.json.publishedUrl, null);

    const row = await rowOf(site, post.id);
    assert.equal(row.slug, "kitchen-remodel");
    assert.equal(row.published_url, null);
    assert.deepEqual(await redirectsOf(site), []);
    assert.equal(site.github.calls.length, callsBefore);
  });

  it("公開済みの slug を変えると、公開 URL が追随し、旧 URL が転送表に残り、Markdown が新パスへ動く", async () => {
    const site = await createSite();
    const admin = await site.seedAdmin();
    const post = await createPost(site, admin.session, "Kitchen renovation");
    await publishPost(site, admin.session, post.id);
    assert.ok(site.github.files.has("content/posts/kitchen-renovation.md"));

    const saved = await savePost(site, admin.session, post.id, "kitchen-remodel");
    assert.equal(saved.status, 200, JSON.stringify(saved.json));
    assert.equal(saved.json.publishedUrl, "/blog/kitchen-remodel");
    assert.equal(saved.json.warning, undefined);

    const row = await rowOf(site, post.id);
    assert.equal(row.slug, "kitchen-remodel");
    assert.equal(row.published_url, "/blog/kitchen-remodel");
    assert.deepEqual(await redirectsOf(site), [
      { post_id: post.id, from_path: "/blog/kitchen-renovation" },
    ]);

    // GitHub: 新パスに frontmatter の slug が差し替わった中身があり、旧パスは無い。1コミット。
    assert.ok(!site.github.files.has("content/posts/kitchen-renovation.md"));
    const moved = site.github.files.get("content/posts/kitchen-remodel.md");
    assert.ok(moved, "新パスにファイルが無い");
    assert.match(moved, /^slug: kitchen-remodel$/m);
    assert.equal(site.github.calls.filter((c) => c.method === "PATCH").length, 1);
  });

  it("旧 URL は、いまの公開 URL に解決する（何度変えても最新へ）", async () => {
    const site = await createSite();
    const admin = await site.seedAdmin();
    const { resolvePostRedirect } = await dist("server/public/slug-redirect");
    const post = await createPost(site, admin.session, "Kitchen renovation");
    await publishPost(site, admin.session, post.id);

    // 変えるたびに公開し直す（保存だけだと status が draft に戻り、転送の対象外になる）。
    await savePost(site, admin.session, post.id, "kitchen-remodel");
    await publishPost(site, admin.session, post.id);
    await savePost(site, admin.session, post.id, "kitchen-makeover");
    await publishPost(site, admin.session, post.id);

    assert.equal(
      await resolvePostRedirect(site.db, site.config, "/blog/kitchen-renovation"),
      "/blog/kitchen-makeover"
    );
    assert.equal(
      await resolvePostRedirect(site.db, site.config, "/blog/kitchen-remodel/"),
      "/blog/kitchen-makeover"
    );
    // いまの URL と無関係な URL は転送しない。
    assert.equal(await resolvePostRedirect(site.db, site.config, "/blog/kitchen-makeover"), null);
    assert.equal(await resolvePostRedirect(site.db, site.config, "/blog/unknown"), null);
  });

  it("公開を取り下げた記事の旧 URL は転送しない（行き先も 404 になるため）", async () => {
    const site = await createSite();
    const admin = await site.seedAdmin();
    const { resolvePostRedirect } = await dist("server/public/slug-redirect");
    const post = await createPost(site, admin.session, "Kitchen renovation");
    await publishPost(site, admin.session, post.id);
    await savePost(site, admin.session, post.id, "kitchen-remodel");

    // 保存で status は draft に戻る（公開処理を通していない）。
    assert.equal((await rowOf(site, post.id)).status, "draft");
    assert.equal(await resolvePostRedirect(site.db, site.config, "/blog/kitchen-renovation"), null);

    // 公開し直すと転送が効く。
    await publishPost(site, admin.session, post.id);
    assert.equal(
      await resolvePostRedirect(site.db, site.config, "/blog/kitchen-renovation"),
      "/blog/kitchen-remodel"
    );
  });

  it("中間処理は転送表に当たれば 301、外れれば次へ流す", async () => {
    const site = await createSite();
    const admin = await site.seedAdmin();
    const { createSlugRedirectMiddleware } = await dist("server/public/slug-redirect");
    const post = await createPost(site, admin.session, "Kitchen renovation");
    await publishPost(site, admin.session, post.id);
    await savePost(site, admin.session, post.id, "kitchen-remodel");
    await publishPost(site, admin.session, post.id);

    const middleware = createSlugRedirectMiddleware(site.config);
    const run = (path) =>
      middleware({
        request: new Request(`https://example.test${path}`),
        env: site.env,
        next: async () => new Response("next", { status: 200 }),
      });

    const hit = await run("/blog/kitchen-renovation?utm=x");
    assert.equal(hit.status, 301);
    assert.equal(hit.headers.get("Location"), "https://example.test/blog/kitchen-remodel?utm=x");

    const miss = await run("/blog/kitchen-remodel");
    assert.equal(miss.status, 200);
    assert.equal(await miss.text(), "next");
  });

  it("形式が違う・他の記事と重複する slug は 400。空・同じ値は何も変えない", async () => {
    const site = await createSite();
    const admin = await site.seedAdmin();
    const post = await createPost(site, admin.session, "Kitchen renovation");
    await createPost(site, admin.session, "Bathroom renovation");

    const invalid = await savePost(site, admin.session, post.id, "Kitchen Remodel!");
    assert.equal(invalid.status, 400);
    const taken = await savePost(site, admin.session, post.id, "bathroom-renovation");
    assert.equal(taken.status, 400);
    assert.match(taken.json.message, /別の記事/);

    const same = await savePost(site, admin.session, post.id, "kitchen-renovation");
    assert.equal(same.status, 200);
    const empty = await savePost(site, admin.session, post.id, "");
    assert.equal(empty.status, 200);
    assert.equal((await rowOf(site, post.id)).slug, "kitchen-renovation");
  });

  it("別の記事が昔使っていた URL を引き取ると、その転送は消える", async () => {
    const site = await createSite();
    const admin = await site.seedAdmin();
    const first = await createPost(site, admin.session, "Kitchen renovation");
    await publishPost(site, admin.session, first.id);
    await savePost(site, admin.session, first.id, "kitchen-remodel");
    assert.equal((await redirectsOf(site)).length, 1);

    const second = await createPost(site, admin.session, "Bathroom renovation");
    await publishPost(site, admin.session, second.id);
    // 2本目が /blog/kitchen-renovation を引き取る。
    const saved = await savePost(site, admin.session, second.id, "kitchen-renovation");
    assert.equal(saved.status, 200, JSON.stringify(saved.json));

    const redirects = await redirectsOf(site);
    assert.deepEqual(
      redirects.map((r) => r.from_path),
      ["/blog/bathroom-renovation"]
    );
  });

  it("転送表が無いサイトでも保存は通り、警告が付く", async () => {
    const site = await createSite({ upTo: "0007" });
    const admin = await site.seedAdmin();
    const post = await createPost(site, admin.session, "Kitchen renovation");
    await publishPost(site, admin.session, post.id);

    const saved = await savePost(site, admin.session, post.id, "kitchen-remodel");
    assert.equal(saved.status, 200, JSON.stringify(saved.json));
    assert.match(saved.json.warning, /0008/);
    assert.equal((await rowOf(site, post.id)).slug, "kitchen-remodel");

    const { resolvePostRedirect } = await dist("server/public/slug-redirect");
    assert.equal(await resolvePostRedirect(site.db, site.config, "/blog/kitchen-renovation"), null);
  });

  it("記事を削除すると転送も消える", async () => {
    const site = await createSite();
    const admin = await site.seedAdmin();
    const post = await createPost(site, admin.session, "Kitchen renovation");
    await publishPost(site, admin.session, post.id);
    await savePost(site, admin.session, post.id, "kitchen-remodel");
    assert.equal((await redirectsOf(site)).length, 1);

    const deleted = await site.call(site.handlers.postDelete, {
      session: admin.session,
      method: "DELETE",
      params: { id: post.id },
    });
    assert.equal(deleted.status, 200, JSON.stringify(deleted.json));
    assert.deepEqual(await redirectsOf(site), []);
  });

  it("GitHub が落ちているとき、source のサイトは何も変えずに 500、backup のサイトは変えて警告", async () => {
    const source = await createSite({ config: { github: { owner: "o", repo: "r", mode: "source" } } });
    const sourceAdmin = await source.seedAdmin();
    const sourcePost = await createPost(source, sourceAdmin.session, "Kitchen renovation");
    await publishPost(source, sourceAdmin.session, sourcePost.id);
    source.github.failWrites = true;
    const failed = await savePost(source, sourceAdmin.session, sourcePost.id, "kitchen-remodel");
    assert.equal(failed.status, 500);
    const sourceRow = await rowOf(source, sourcePost.id);
    assert.equal(sourceRow.slug, "kitchen-renovation");
    assert.equal(sourceRow.published_url, "/blog/kitchen-renovation");
    assert.deepEqual(await redirectsOf(source), []);

    const backup = await createSite({ config: { github: { owner: "o", repo: "r", mode: "backup" } } });
    const backupAdmin = await backup.seedAdmin();
    const backupPost = await createPost(backup, backupAdmin.session, "Kitchen renovation");
    await publishPost(backup, backupAdmin.session, backupPost.id);
    backup.github.failWrites = true;
    const saved = await savePost(backup, backupAdmin.session, backupPost.id, "kitchen-remodel");
    assert.equal(saved.status, 200, JSON.stringify(saved.json));
    assert.ok(saved.json.warning);
    const backupRow = await rowOf(backup, backupPost.id);
    assert.equal(backupRow.slug, "kitchen-remodel");
    assert.equal(backupRow.published_url, "/blog/kitchen-remodel");
    assert.equal((await redirectsOf(backup)).length, 1);
  });
});
