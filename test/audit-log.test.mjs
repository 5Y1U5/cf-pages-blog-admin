// 操作ログが残ること、そして残せない環境でも本処理が止まらないことの検証。

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { createSite } from "./support/harness.mjs";

async function actions(site) {
  const { results } = await site.db
    .prepare("SELECT action FROM audit_logs ORDER BY created_at, id")
    .bind()
    .all();
  return results.map((row) => row.action);
}

describe("操作ログ", () => {
  it("ログイン・ユーザー追加・パスワード変更が記録される", async () => {
    const site = await createSite();
    const admin = await site.seedAdmin();

    await site.call(site.handlers.usersCreate, {
      session: admin.session,
      body: { email: "editor@example.test", role: "client_publisher" },
    });

    const recorded = await actions(site);
    assert.ok(recorded.includes("auth.login"));
    assert.ok(recorded.includes("user.create"));
  });

  it("管理者は一覧の応答で直近の記録を受け取る", async () => {
    const site = await createSite();
    const admin = await site.seedAdmin();

    const list = await site.call(site.handlers.usersList, { session: admin.session });
    assert.equal(list.status, 200);
    assert.ok(Array.isArray(list.json.auditLogs));
    const login = list.json.auditLogs.find((row) => row.action === "auth.login");
    assert.ok(login, "ログインの記録が入っていること");
    assert.equal(login.actor_email, admin.email);
    assert.equal(login.ip, "203.0.113.10");
  });

  it("記録先のテーブルが無くてもログインとユーザー追加は通る", async () => {
    // 0005 までしか流していない = 0006 の列も 0007 のテーブルも無いサイト。
    const site = await createSite({ upTo: "0005" });
    const admin = await site.seedAdmin();
    assert.equal(admin.result.status, 200);

    const created = await site.call(site.handlers.usersCreate, {
      session: admin.session,
      body: { email: "editor@example.test", role: "client_publisher" },
    });
    assert.equal(created.status, 201);

    // 列が無いので変更を促せないが、その利用者は普通に操作できる（締め出さない）。
    const login = await site.call(site.handlers.login, {
      body: { email: "editor@example.test", password: created.json.initialPassword },
    });
    assert.equal(login.status, 200);
    const posts = await site.call(site.handlers.postsList, { session: login.session });
    assert.equal(posts.status, 200);

    const me = await site.call(site.handlers.me, { session: login.session });
    assert.equal(me.status, 200);
    assert.equal(me.json.mustChangePassword, false);

    // 一覧も落ちず、記録は空で返る。
    const list = await site.call(site.handlers.usersList, { session: admin.session });
    assert.equal(list.status, 200);
    assert.deepEqual(list.json.auditLogs, []);
  });
});
