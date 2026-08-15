// ハンドラを Pages Functions と同じ形で呼ぶための足場。
// dist を読むので、テストは「配布されるもの」を試している。

import { createDatabase } from "./d1.mjs";

export const CLIENT_ID = "testclient";
export const SESSION_COOKIE = "__Host-test_admin_session";

const dist = (path) => import(`../../dist/${path}.js`);

export async function loadConfig(overrides = {}) {
  const { defineBlogAdminConfig } = await dist("config/index");
  return defineBlogAdminConfig({
    clientId: CLIENT_ID,
    defaultAuthor: "テスト",
    sessionCookieName: SESSION_COOKIE,
    ...overrides,
  });
}

/** 1つのサイトぶんの環境。DB とハンドラをまとめて持つ。 */
export async function createSite({ upTo = "9999", config: overrides = {} } = {}) {
  const db = createDatabase({ clientId: CLIENT_ID, upTo });
  const config = await loadConfig(overrides);
  const env = { ADMIN_DB: db };

  const [me, login, users, userDetail, posts] = await Promise.all([
    dist("server/handlers/me"),
    dist("server/handlers/auth/login"),
    dist("server/handlers/users/index"),
    dist("server/handlers/users/detail"),
    dist("server/handlers/posts/index"),
  ]);

  const handlers = {
    me: me.createMeHandlers(config).onRequestGet,
    login: login.createLoginHandlers(config).onRequestPost,
    usersList: users.createUsersHandlers(config).onRequestGet,
    usersCreate: users.createUsersHandlers(config).onRequestPost,
    userPut: userDetail.createUserDetailHandlers(config).onRequestPut,
    postsList: posts.createPostsHandlers(config).onRequestGet,
  };

  /**
   * ハンドラを1回呼ぶ。`session` を渡すとその Cookie を載せる。
   * 応答は status と JSON、Set-Cookie から取り出したセッションを返す。
   */
  async function call(handler, { body, session, params = {}, ip = "203.0.113.10" } = {}) {
    const headers = { "Content-Type": "application/json", "cf-connecting-ip": ip };
    if (session) headers.Cookie = `${SESSION_COOKIE}=${session}`;
    const request = new Request("https://example.test/api/admin/x", {
      method: body === undefined ? "GET" : "POST",
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const response = await handler({ request, env, params });
    const text = await response.text();
    const setCookie = response.headers.get("Set-Cookie") || "";
    const match = setCookie.match(new RegExp(`${SESSION_COOKIE}=([^;]*)`));
    return {
      status: response.status,
      json: text ? JSON.parse(text) : null,
      session: match ? decodeURIComponent(match[1]) : null,
    };
  }

  /** 管理者を1人作ってログインし、そのセッションを返す。 */
  async function seedAdmin({ email = "admin@example.test", password = "SeedPassword2026" } = {}) {
    const { hashPassword, nowIso } = await dist("server/_shared/admin");
    await db
      .prepare(
        `INSERT INTO users (id, email, name, role, client_id, password_hash, created_at, updated_at)
         VALUES (?, ?, ?, 'admin', ?, ?, ?, ?)`
      )
      .bind("usr_seedadmin", email, "管理者", CLIENT_ID, await hashPassword(password), nowIso(), nowIso())
      .run();
    const result = await call(handlers.login, { body: { email, password } });
    return { email, password, session: result.session, result };
  }

  return { db, env, config, handlers, call, seedAdmin };
}
