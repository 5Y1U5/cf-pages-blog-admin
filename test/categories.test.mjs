// カテゴリの追加・改名・削除の検証。
//
// 改名で確かめたいのは「表示名がテーブル間でずれない」こと。カテゴリ表だけ直しても、
// 記事が持つ表示名が古いままだと一覧と記事ページで名前が食い違う。

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { createSite } from "./support/harness.mjs";

const CATEGORIES_JSON = "content/blog-categories.json";

/** カテゴリを1つ作って、その行を返す。 */
async function addCategory(site, session, slug, label) {
  const created = await site.call(site.handlers.categoriesCreate, {
    session,
    body: { slug, label },
  });
  assert.equal(created.status, 200);
  return created.json.category;
}

/** 記事を1本作って、その id を返す。 */
async function addPost(site, session, { title, categorySlug, categoryLabel }) {
  const created = await site.call(site.handlers.postsCreate, {
    session,
    body: { title, categorySlug, categoryLabel, bodyMarkdown: "本文" },
  });
  assert.equal(created.status, 201);
  return created.json.post.id;
}

/** 記事が持っているカテゴリの表示名を読む。 */
async function labelOfPost(site, id) {
  const row = await site.db
    .prepare("SELECT category_slug, category_label FROM post_drafts WHERE id = ?")
    .bind(id)
    .first();
  return row;
}

describe("カテゴリの管理", () => {
  it("表示名を変えると、そのカテゴリの記事の表示名も追随する", async () => {
    const site = await createSite();
    const admin = await site.seedAdmin();

    const column = await addCategory(site, admin.session, "column", "ブログ");
    await addCategory(site, admin.session, "news", "お知らせ");

    const target = await addPost(site, admin.session, {
      title: "Kitchen renovation",
      categorySlug: "column",
      categoryLabel: "ブログ",
    });
    const untouched = await addPost(site, admin.session, {
      title: "Office notice",
      categorySlug: "news",
      categoryLabel: "お知らせ",
    });

    const renamed = await site.call(site.handlers.categoryPatch, {
      session: admin.session,
      method: "PATCH",
      params: { id: column.id },
      body: { label: "住まいのコラム" },
    });
    assert.equal(renamed.status, 200);
    assert.equal(renamed.json.category.label, "住まいのコラム");
    assert.equal(renamed.json.updatedPosts, 1);

    // 記事側が持つ表示名も変わっている。スラッグは触られていない。
    const after = await labelOfPost(site, target);
    assert.equal(after.category_label, "住まいのコラム");
    assert.equal(after.category_slug, "column");

    // 別カテゴリの記事は巻き込まれない。
    const other = await labelOfPost(site, untouched);
    assert.equal(other.category_label, "お知らせ");

    // 一覧も新しい名前で返る。
    const list = await site.call(site.handlers.categoriesList, { session: admin.session });
    const listed = list.json.categories.find((row) => row.slug === "column");
    assert.equal(listed.label, "住まいのコラム");
  });

  it("改名すると、書き出す JSON も新しい名前になる", async () => {
    const site = await createSite();
    const admin = await site.seedAdmin();
    const column = await addCategory(site, admin.session, "column", "ブログ");

    await site.call(site.handlers.categoryPatch, {
      session: admin.session,
      method: "PATCH",
      params: { id: column.id },
      body: { label: "住まいのコラム", description: "暮らしの話題" },
    });

    const written = JSON.parse(site.github.files.get(CATEGORIES_JSON));
    assert.deepEqual(written, [
      { code: "column", slug: "column", label: "住まいのコラム", description: "暮らしの話題" },
    ]);
  });

  it("スラッグとコードは変更できない", async () => {
    const site = await createSite();
    const admin = await site.seedAdmin();
    const column = await addCategory(site, admin.session, "column", "ブログ");

    const bySlug = await site.call(site.handlers.categoryPatch, {
      session: admin.session,
      method: "PATCH",
      params: { id: column.id },
      body: { label: "住まいのコラム", slug: "housing" },
    });
    assert.equal(bySlug.status, 400);

    const byCode = await site.call(site.handlers.categoryPatch, {
      session: admin.session,
      method: "PATCH",
      params: { id: column.id },
      body: { label: "住まいのコラム", code: "housing" },
    });
    assert.equal(byCode.status, 400);

    // 弾かれた側の変更は何も残っていない。
    const list = await site.call(site.handlers.categoriesList, { session: admin.session });
    assert.deepEqual(
      list.json.categories.map((row) => [row.slug, row.label]),
      [["column", "ブログ"]]
    );
    // 変更していないので JSON も書き出していない。
    assert.equal(site.github.files.has(CATEGORIES_JSON), false);

    // 同じスラッグを添えて送るぶんには通る（画面が現在値を送り返しても弾かれない）。
    const same = await site.call(site.handlers.categoryPatch, {
      session: admin.session,
      method: "PATCH",
      params: { id: column.id },
      body: { label: "住まいのコラム", slug: "column" },
    });
    assert.equal(same.status, 200);
    assert.equal(same.json.category.slug, "column");
  });

  it("使っている記事があるカテゴリは削除できない", async () => {
    const site = await createSite();
    const admin = await site.seedAdmin();
    const column = await addCategory(site, admin.session, "column", "ブログ");
    const post = await addPost(site, admin.session, {
      title: "Kitchen renovation",
      categorySlug: "column",
      categoryLabel: "ブログ",
    });

    const refused = await site.call(site.handlers.categoryDelete, {
      session: admin.session,
      method: "DELETE",
      params: { id: column.id },
    });
    assert.equal(refused.status, 400);
    assert.match(refused.json.message, /削除できません/);

    // 消えていない。
    const stillThere = await site.call(site.handlers.categoriesList, {
      session: admin.session,
    });
    assert.equal(stillThere.json.categories.length, 1);

    // 記事を消せば削除できる。
    await site.db.prepare("DELETE FROM post_drafts WHERE id = ?").bind(post).run();
    const removed = await site.call(site.handlers.categoryDelete, {
      session: admin.session,
      method: "DELETE",
      params: { id: column.id },
    });
    assert.equal(removed.status, 200);
    const afterDelete = await site.call(site.handlers.categoriesList, {
      session: admin.session,
    });
    assert.equal(afterDelete.json.categories.length, 0);
  });

  it("JSON の書き出しに失敗したら、改名を元へ戻す", async () => {
    const site = await createSite();
    const admin = await site.seedAdmin();
    const column = await addCategory(site, admin.session, "column", "ブログ");
    const post = await addPost(site, admin.session, {
      title: "Kitchen renovation",
      categorySlug: "column",
      categoryLabel: "ブログ",
    });

    site.github.failWrites = true;
    const failed = await site.call(site.handlers.categoryPatch, {
      session: admin.session,
      method: "PATCH",
      params: { id: column.id },
      body: { label: "住まいのコラム" },
    });
    assert.equal(failed.status, 500);

    // D1 と JSON がずれたまま残ると、次の公開で古い名前へ黙って戻ってしまう。
    const list = await site.call(site.handlers.categoriesList, { session: admin.session });
    assert.equal(list.json.categories[0].label, "ブログ");
    assert.equal((await labelOfPost(site, post)).category_label, "ブログ");
  });

  it("存在しないカテゴリは 404 になる", async () => {
    const site = await createSite();
    const admin = await site.seedAdmin();
    const missing = await site.call(site.handlers.categoryPatch, {
      session: admin.session,
      method: "PATCH",
      params: { id: "cat_nothing" },
      body: { label: "住まいのコラム" },
    });
    assert.equal(missing.status, 404);
  });
});
