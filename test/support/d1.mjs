// D1Database の最小実装（node:sqlite）。
//
// ハンドラが使う API は prepare / bind / first / all / run の5つだけなので、そこだけを賄う。
// 列が無い場合に例外が飛ぶ挙動も D1 と同じで、migration 未適用時のふるまいをそのまま試せる。

import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

// node:sqlite は boolean と undefined を受け付けないので、D1 に合わせて数値・null へ寄せる。
function normalizeBinding(value) {
  if (value === undefined) return null;
  if (typeof value === "boolean") return value ? 1 : 0;
  return value;
}

class PreparedStatement {
  constructor(db, sql, args) {
    this.db = db;
    this.sql = sql;
    this.args = args;
  }

  bind(...args) {
    return new PreparedStatement(this.db, this.sql, args.map(normalizeBinding));
  }

  async first() {
    return this.db.prepare(this.sql).get(...this.args) ?? null;
  }

  async all() {
    return { results: this.db.prepare(this.sql).all(...this.args), success: true };
  }

  async run() {
    const result = this.db.prepare(this.sql).run(...this.args);
    return { success: true, meta: { changes: Number(result.changes) } };
  }
}

export class FakeD1 {
  constructor(db) {
    this.db = db;
  }

  prepare(sql) {
    return new PreparedStatement(this.db, sql, []);
  }
}

/** パッケージが配る migration のうち、指定した番号までを流したデータベースを作る。 */
export function createDatabase({ clientId = "testclient", upTo = "9999" } = {}) {
  const db = new DatabaseSync(":memory:");

  const template = readFileSync(
    join(PACKAGE_ROOT, "templates", "0001_admin_editor.sql.tpl"),
    "utf8"
  );
  db.exec(
    template.replaceAll("{{clientId}}", clientId).replaceAll("{{defaultAuthor}}", "テスト")
  );

  for (const name of readdirSync(join(PACKAGE_ROOT, "migrations")).sort()) {
    if (!name.endsWith(".sql")) continue;
    if (name.slice(0, 4) > upTo) continue;
    db.exec(readFileSync(join(PACKAGE_ROOT, "migrations", name), "utf8"));
  }

  return new FakeD1(db);
}
