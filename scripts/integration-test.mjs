#!/usr/bin/env node
// パッケージ単体の型検査では「Pages Functions として組み上がるか」が分からないため、
// 使い捨ての導入先を作って次を確認する。
//
//   1. npm pack した tarball を install できる
//   2. `cf-pages-blog-admin init` が足場を生成する
//   3. 生成された functions/ が導入先の tsconfig で型検査を通る
//   4. 設定から必須項目を1つ消すと型検査が落ちる（設定漏れの検出が効いている）
//   5. `wrangler pages functions build` が成功し、想定どおりのルートが登録される

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PACKAGE_ROOT = process.cwd();
const work = mkdtempSync(join(tmpdir(), "cf-pages-blog-admin-it-"));
const site = join(work, "site");
mkdirSync(join(site, "public"), { recursive: true });

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...options,
  });
}

function step(label) {
  process.stdout.write(`\n== ${label} ==\n`);
}

try {
  step("パッケージを固める");
  run("npm", ["run", "build"], { cwd: PACKAGE_ROOT });
  const packed = JSON.parse(
    run("npm", ["pack", "--json", "--pack-destination", work], { cwd: PACKAGE_ROOT })
  )[0].filename;
  const tarball = join(work, packed);

  step("使い捨ての導入先を作る");
  writeFileSync(
    join(site, "package.json"),
    JSON.stringify({ name: "it-site", private: true, type: "module", version: "0.0.0" }, null, 2)
  );
  writeFileSync(join(site, "public", "index.html"), "<!doctype html><title>t</title>\n");
  writeFileSync(
    join(site, "wrangler.toml"),
    'name = "it-site"\ncompatibility_date = "2026-01-01"\npages_build_output_dir = "public"\n'
  );
  run("npm", ["i", "--no-audit", "--no-fund", tarball, "react", "react-dom"], { cwd: site });
  run("npm", ["i", "-D", "--no-audit", "--no-fund", "typescript", "@cloudflare/workers-types"], {
    cwd: site,
  });

  step("init で足場を生成する");
  run(
    "npx",
    [
      "cf-pages-blog-admin",
      "init",
      "--no-input",
      "--client-id",
      "demo",
      "--author",
      "Demo Author",
      "--cookie-prefix",
      "demo",
      "--posts-dir",
      "content/blog",
      "--hero-key",
      "hero",
      "--github",
      "demo-owner/demo-repo",
      "--framework",
      "nextjs",
    ],
    { cwd: site }
  );

  writeFileSync(
    join(site, "functions", "tsconfig.json"),
    JSON.stringify(
      {
        compilerOptions: {
          target: "ES2022",
          module: "ESNext",
          moduleResolution: "Bundler",
          lib: ["ES2022"],
          types: ["@cloudflare/workers-types"],
          strict: true,
          skipLibCheck: true,
          noEmit: true,
          isolatedModules: true,
        },
        include: ["**/*.ts", "../blog-admin.config.ts"],
      },
      null,
      2
    )
  );

  step("導入先の型検査が通る");
  run("npx", ["tsc", "--noEmit", "-p", "functions/tsconfig.json"], { cwd: site });

  step("設定漏れが型検査で落ちる");
  const configPath = join(site, "blog-admin.config.ts");
  const originalConfig = readFileSync(configPath, "utf8");
  writeFileSync(configPath, originalConfig.replace(/\s*defaultAuthor: .*\n/, "\n"));
  let gateWorks = false;
  try {
    run("npx", ["tsc", "--noEmit", "-p", "functions/tsconfig.json"], { cwd: site });
  } catch {
    gateWorks = true;
  }
  writeFileSync(configPath, originalConfig);
  if (!gateWorks) {
    throw new Error("設定から必須項目を消しても型検査が通ってしまう（検出が効いていない）");
  }

  step("Pages Functions として組み上がる");
  const workerFile = join(work, "worker.js");
  run("npx", ["--yes", "wrangler@4", "pages", "functions", "build", `--outfile=${workerFile}`], {
    cwd: site,
  });

  const worker = readFileSync(workerFile, "utf8");
  const expectedRoutes = [
    "/api/admin/me",
    "/api/admin/auth/login",
    "/api/admin/auth/logout",
    "/api/admin/posts",
    "/api/admin/posts/:id",
    "/api/admin/posts/:id/publish",
    "/api/admin/posts/:id/unpublish",
    "/api/admin/categories",
    "/api/admin/categories/:id",
    "/api/admin/users",
    "/api/admin/users/:id",
    "/api/admin/assets/upload",
    "/api/admin/assets/public/:key",
  ];
  const missing = expectedRoutes.filter(
    (route) => !worker.includes(`routePath: "${route}"`)
  );
  if (missing.length > 0) {
    throw new Error(`ルートが登録されていない: ${missing.join(", ")}`);
  }
  if (!worker.includes("__Host-demo_admin_session")) {
    throw new Error("設定値がバンドルに取り込まれていない");
  }

  process.stdout.write("\n統合テスト: すべて通過\n");
} finally {
  rmSync(work, { recursive: true, force: true });
}
