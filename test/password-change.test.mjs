// 発行したパスワードのままでは操作させない、という流れの検証。
// 画面ではなくサーバー側で止まっていることを確かめるのが目的。

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { createSite } from "./support/harness.mjs";

describe("本人によるパスワード変更", () => {
  it("追加されたユーザーは、変更するまで記事一覧を取得できない", async () => {
    const site = await createSite();
    const admin = await site.seedAdmin();
    assert.equal(admin.result.status, 200);

    const created = await site.call(site.handlers.usersCreate, {
      session: admin.session,
      body: { email: "editor@example.test", role: "client_publisher" },
    });
    assert.equal(created.status, 201);
    const issued = created.json.initialPassword;
    assert.ok(issued && issued.length >= 14);

    const login = await site.call(site.handlers.login, {
      body: { email: "editor@example.test", password: issued },
    });
    assert.equal(login.status, 200);

    // 画面を出さないだけでは素通りするので、API そのものが止まっていること。
    const posts = await site.call(site.handlers.postsList, { session: login.session });
    assert.equal(posts.status, 403);
    assert.equal(posts.json.error, "password_change_required");

    // 状態を知るための me だけは通る。
    const me = await site.call(site.handlers.me, { session: login.session });
    assert.equal(me.status, 200);
    assert.equal(me.mustChangePassword, undefined);
    assert.equal(me.json.mustChangePassword, true);

    // 現在のパスワードが違えば変えられない。
    const wrong = await site.call(site.handlers.userPut, {
      session: login.session,
      params: { id: "me" },
      body: { currentPassword: "NotTheIssuedOne", newPassword: "BrandNewPassword2026" },
    });
    assert.equal(wrong.status, 400);

    // 短いパスワードには変えられない。
    const short = await site.call(site.handlers.userPut, {
      session: login.session,
      params: { id: "me" },
      body: { currentPassword: issued, newPassword: "short1" },
    });
    assert.equal(short.status, 400);

    // 正しく変えれば通るようになる。
    const changed = await site.call(site.handlers.userPut, {
      session: login.session,
      params: { id: "me" },
      body: { currentPassword: issued, newPassword: "BrandNewPassword2026" },
    });
    assert.equal(changed.status, 200);

    const after = await site.call(site.handlers.postsList, { session: login.session });
    assert.equal(after.status, 200);

    // 古いパスワードではログインできず、新しいパスワードでログインできる。
    const oldLogin = await site.call(site.handlers.login, {
      body: { email: "editor@example.test", password: issued },
    });
    assert.equal(oldLogin.status, 401);
    const newLogin = await site.call(site.handlers.login, {
      body: { email: "editor@example.test", password: "BrandNewPassword2026" },
    });
    assert.equal(newLogin.status, 200);
  });

  it("変更すると自分の他のセッションだけが失効し、操作中のセッションは残る", async () => {
    const site = await createSite();
    const admin = await site.seedAdmin();

    // 同じ利用者で2つセッションを張る。
    const first = await site.call(site.handlers.login, {
      body: { email: admin.email, password: admin.password },
    });
    const second = await site.call(site.handlers.login, {
      body: { email: admin.email, password: admin.password },
    });
    assert.ok(first.session && second.session && first.session !== second.session);

    const changed = await site.call(site.handlers.userPut, {
      session: second.session,
      params: { id: "me" },
      body: { currentPassword: admin.password, newPassword: "AnotherPassword2026" },
    });
    assert.equal(changed.status, 200);

    const keptAlive = await site.call(site.handlers.me, { session: second.session });
    assert.equal(keptAlive.status, 200);

    const revoked = await site.call(site.handlers.me, { session: first.session });
    assert.equal(revoked.status, 401);
  });

  it("パスワードを再発行された利用者は、もう一度変更を求められる", async () => {
    const site = await createSite();
    const admin = await site.seedAdmin();

    const created = await site.call(site.handlers.usersCreate, {
      session: admin.session,
      body: { email: "writer@example.test", role: "client_publisher" },
    });
    const target = created.json.user.id;

    // いったん本人が変えて、通常どおり使える状態にする。
    const login = await site.call(site.handlers.login, {
      body: { email: "writer@example.test", password: created.json.initialPassword },
    });
    await site.call(site.handlers.userPut, {
      session: login.session,
      params: { id: "me" },
      body: {
        currentPassword: created.json.initialPassword,
        newPassword: "WriterOwnPassword2026",
      },
    });

    // 管理者が再発行すると、また変更するまで止まる。
    const reset = await site.call(site.handlers.userPut, {
      session: admin.session,
      params: { id: target },
      body: { resetPassword: true },
    });
    assert.equal(reset.status, 200);
    assert.ok(reset.json.newPassword);

    const relogin = await site.call(site.handlers.login, {
      body: { email: "writer@example.test", password: reset.json.newPassword },
    });
    const blocked = await site.call(site.handlers.postsList, { session: relogin.session });
    assert.equal(blocked.status, 403);
    assert.equal(blocked.json.error, "password_change_required");
  });

  it("既存の利用者は影響を受けない", async () => {
    const site = await createSite();
    const admin = await site.seedAdmin();
    const posts = await site.call(site.handlers.postsList, { session: admin.session });
    assert.equal(posts.status, 200);
  });
});
