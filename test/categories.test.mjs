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

/** 記事を1本公開して、書き出された .md のパスを返す。 */
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

/** 書き出された Markdown の frontmatter から categoryLabel を取り出す。 */
function labelInMarkdown(site, path) {
  const markdown = site.github.files.get(path);
  assert.ok(markdown, `${path} が書き出されていません`);
  const match = markdown.match(/^categoryLabel: (.*)$/m);
  return match ? JSON.parse(match[1]) : null;
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

  it("追加した時点で JSON にも書き出す", async () => {
    const site = await createSite();
    const admin = await site.seedAdmin();

    // 記事を公開するまで書かれないままだと、追加したカテゴリが画面にはあるのに
    // サイトには無い状態が続く。
    await addCategory(site, admin.session, "column", "ブログ");
    assert.deepEqual(JSON.parse(site.github.files.get(CATEGORIES_JSON)), [
      { code: "column", slug: "column", label: "ブログ" },
    ]);

    await addCategory(site, admin.session, "news", "お知らせ");
    assert.deepEqual(
      JSON.parse(site.github.files.get(CATEGORIES_JSON)).map((row) => row.slug),
      ["column", "news"]
    );
  });

  it("追加時の書き出しに失敗したら、そのカテゴリは残らない", async () => {
    const site = await createSite();
    const admin = await site.seedAdmin();

    site.github.failWrites = true;
    const failed = await site.call(site.handlers.categoriesCreate, {
      session: admin.session,
      body: { slug: "column", label: "ブログ" },
    });
    assert.equal(failed.status, 500);

    const list = await site.call(site.handlers.categoriesList, { session: admin.session });
    assert.deepEqual(list.json.categories, []);
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
    // 変更していないので、書き出した JSON も追加した時のままになっている。
    assert.deepEqual(JSON.parse(site.github.files.get(CATEGORIES_JSON)), [
      { code: "column", slug: "column", label: "ブログ" },
    ]);

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

  it("改名すると、公開済み記事の Markdown も新しい名前になる", async () => {
    const site = await createSite();
    const admin = await site.seedAdmin();
    const column = await addCategory(site, admin.session, "column", "ブログ");

    const publishedId = await addPost(site, admin.session, {
      title: "Kitchen renovation",
      categorySlug: "column",
      categoryLabel: "ブログ",
    });
    await publishPost(site, admin.session, publishedId);
    const publishedPath = "content/posts/kitchen-renovation.md";
    assert.equal(labelInMarkdown(site, publishedPath), "ブログ");

    // 下書きのままの記事にはファイルが無い。書き戻しの対象にもならない。
    await addPost(site, admin.session, {
      title: "Curtain selection",
      categorySlug: "column",
      categoryLabel: "ブログ",
    });
    assert.equal(site.github.files.has("content/posts/curtain-selection.md"), false);

    const renamed = await site.call(site.handlers.categoryPatch, {
      session: admin.session,
      method: "PATCH",
      params: { id: column.id },
      body: { label: "暮らしのコラム" },
    });
    assert.equal(renamed.status, 200);
    assert.equal(renamed.json.republishedPosts, 1);

    // 公開済みの記事は frontmatter まで新しい名前になっている。
    assert.equal(labelInMarkdown(site, publishedPath), "暮らしのコラム");
    // 下書きはファイルが作られないまま。
    assert.equal(site.github.files.has("content/posts/curtain-selection.md"), false);
  });

  it("説明だけ変えたときは、記事の Markdown を書き換えない", async () => {
    const site = await createSite();
    const admin = await site.seedAdmin();
    const column = await addCategory(site, admin.session, "column", "ブログ");
    const id = await addPost(site, admin.session, {
      title: "Kitchen renovation",
      categorySlug: "column",
      categoryLabel: "ブログ",
    });
    await publishPost(site, admin.session, id);

    const patched = await site.call(site.handlers.categoryPatch, {
      session: admin.session,
      method: "PATCH",
      params: { id: column.id },
      body: { label: "ブログ", description: "暮らしの話題" },
    });
    assert.equal(patched.status, 200);
    assert.equal(patched.json.republishedPosts, 0);
  });

  it("記事の書き戻しは1コミットで、失敗したら1本も書き換わらない", async () => {
    const site = await createSite();
    const admin = await site.seedAdmin();
    const column = await addCategory(site, admin.session, "column", "ブログ");

    const paths = [];
    for (const title of ["Kitchen renovation", "Bathroom remodel", "Garden planning"]) {
      const id = await addPost(site, admin.session, {
        title,
        categorySlug: "column",
        categoryLabel: "ブログ",
      });
      await publishPost(site, admin.session, id);
      paths.push(`content/posts/${title.toLowerCase().replaceAll(" ", "-")}.md`);
    }

    // ファイルは作れるのに、最後のブランチ付け替えだけ失敗する場合。
    site.github.failRefUpdate = true;
    const failed = await site.call(site.handlers.categoryPatch, {
      session: admin.session,
      method: "PATCH",
      params: { id: column.id },
      body: { label: "暮らしのコラム" },
    });
    assert.equal(failed.status, 500);

    // 1本も書き換わっていない（3本のうち2本だけ、という状態を作らない）。
    for (const path of paths) {
      assert.equal(labelInMarkdown(site, path), "ブログ");
    }
    // D1 も元のまま。
    const list = await site.call(site.handlers.categoriesList, { session: admin.session });
    assert.equal(list.json.categories[0].label, "ブログ");

    // 付け替えが通るようになれば、3本まとめて1コミットで書き換わる。
    site.github.failRefUpdate = false;
    const retried = await site.call(site.handlers.categoryPatch, {
      session: admin.session,
      method: "PATCH",
      params: { id: column.id },
      body: { label: "暮らしのコラム" },
    });
    assert.equal(retried.status, 200);
    assert.equal(retried.json.republishedPosts, 3);
    for (const path of paths) {
      assert.equal(labelInMarkdown(site, path), "暮らしのコラム");
    }
    // ブランチを進めたのは1回だけ。
    const refUpdates = site.github.calls.filter(
      (call) => call.method === "PATCH" && call.path.startsWith("refs/heads/")
    );
    assert.equal(refUpdates.length, 2);
  });

  it("公開中の記事を保存して下書きに戻っていても、改名がサイトへ届く", async () => {
    const site = await createSite();
    const admin = await site.seedAdmin();
    const column = await addCategory(site, admin.session, "column", "ブログ");

    const id = await addPost(site, admin.session, {
      title: "Kitchen renovation",
      categorySlug: "column",
      categoryLabel: "ブログ",
    });
    await publishPost(site, admin.session, id);
    const path = "content/posts/kitchen-renovation.md";
    assert.equal(labelInMarkdown(site, path), "ブログ");

    // 公開済みの記事を開いて「保存」を押した状態。status は draft に戻るが、
    // published_url は残り、サイトには公開時の本文が出たままになる。
    const saved = await site.call(site.handlers.postPut, {
      session: admin.session,
      method: "PUT",
      params: { id },
      body: {
        title: "Kitchen renovation",
        categorySlug: "column",
        categoryLabel: "ブログ",
        bodyMarkdown: "まだ公開していない書きかけの本文",
      },
    });
    assert.equal(saved.status, 200);
    const row = await site.db
      .prepare("SELECT status, published_url FROM post_drafts WHERE id = ?")
      .bind(id)
      .first();
    assert.equal(row.status, "draft");
    assert.ok(row.published_url);

    const renamed = await site.call(site.handlers.categoryPatch, {
      session: admin.session,
      method: "PATCH",
      params: { id: column.id },
      body: { label: "暮らしのコラム" },
    });
    assert.equal(renamed.status, 200);
    assert.equal(renamed.json.republishedPosts, 1);
    assert.deepEqual(renamed.json.skippedPosts, []);

    const markdown = site.github.files.get(path);
    // 表示名だけが新しくなる。
    assert.equal(labelInMarkdown(site, path), "暮らしのコラム");
    // 書きかけの本文は出さない。公開状態（draft: false）も変えない。
    assert.equal(markdown.includes("まだ公開していない書きかけの本文"), false);
    assert.equal(markdown.includes("draft: false"), true);
  });

  it("公開中の記事のファイルが消えていたら、書き戻せなかった記事として返す", async () => {
    const site = await createSite();
    const admin = await site.seedAdmin();
    const column = await addCategory(site, admin.session, "column", "ブログ");

    const id = await addPost(site, admin.session, {
      title: "Kitchen renovation",
      categorySlug: "column",
      categoryLabel: "ブログ",
    });
    await publishPost(site, admin.session, id);
    await site.call(site.handlers.postPut, {
      session: admin.session,
      method: "PUT",
      params: { id },
      body: {
        title: "Kitchen renovation",
        categorySlug: "column",
        categoryLabel: "ブログ",
        bodyMarkdown: "書きかけ",
      },
    });
    // リポジトリ側で手作業で消された想定。
    site.github.files.delete("content/posts/kitchen-renovation.md");

    const renamed = await site.call(site.handlers.categoryPatch, {
      session: admin.session,
      method: "PATCH",
      params: { id: column.id },
      body: { label: "暮らしのコラム" },
    });
    assert.equal(renamed.status, 200);
    assert.equal(renamed.json.republishedPosts, 0);
    assert.deepEqual(renamed.json.skippedPosts, [{ id, slug: "kitchen-renovation" }]);
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
