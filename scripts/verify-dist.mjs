#!/usr/bin/env node
// ビルド成果物が配布できる状態か検証する。
// - exports マップが指すファイルが実在するか
// - 画面コンポーネントの先頭に "use client" が残っているか

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const problems = [];

for (const [subpath, entry] of Object.entries(pkg.exports)) {
  if (typeof entry === "string") {
    if (!entry.includes("*") && !existsSync(entry)) problems.push(`${subpath}: ${entry} が無い`);
    continue;
  }
  for (const target of Object.values(entry)) {
    if (target.includes("*")) continue; // パターンは個別に確認しない
    if (!existsSync(target)) problems.push(`${subpath}: ${target} が無い`);
  }
}

// パターン指定の subpath は、対応するディレクトリが空でないことだけ見る。
for (const dir of ["dist/server/handlers", "dist/server/_shared"]) {
  if (!existsSync(dir) || readdirSync(dir).length === 0) {
    problems.push(`${dir} が空`);
  }
}

const CLIENT_COMPONENTS = [
  "AdminLoginClient",
  "AdminLogoutButton",
  "AdminPostsClient",
  "AdminEditorClient",
  "AdminUsersClient",
  "RichTextEditor",
];
for (const name of CLIENT_COMPONENTS) {
  const file = join("dist/ui", `${name}.js`);
  if (!existsSync(file)) {
    problems.push(`${file} が無い`);
    continue;
  }
  const first = readFileSync(file, "utf8").split("\n")[0].trim();
  if (first !== '"use client";') {
    problems.push(`${file} の先頭が "use client"; ではない（${first}）`);
  }
}

if (problems.length > 0) {
  for (const problem of problems) process.stderr.write(`  ${problem}\n`);
  process.stderr.write("ビルド成果物の検証に失敗しました。\n");
  process.exit(1);
}
process.stdout.write("ビルド成果物の検証: 問題なし\n");
