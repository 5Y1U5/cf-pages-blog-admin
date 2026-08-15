#!/usr/bin/env node
// 導入・保守用のコマンド。
//   init              足場（設定・再 export・ページ・migration）を生成する
//   sync-migrations   パッケージが配る migration を ./migrations へコピーする
//   check-migrations  コピーがパッケージの中身と一致しているか検証する（CI 用）
//   sync-routes       Pages Functions の再 export を過不足なく揃える
//   check-routes      再 export がパッケージのルート定義と一致しているか検証する（CI 用）

import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { createInterface } from "node:readline/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PACKAGE_NAME = JSON.parse(
  readFileSync(join(PACKAGE_ROOT, "package.json"), "utf8")
).name;
const CWD = process.cwd();

function log(message) {
  process.stdout.write(`${message}\n`);
}

function fail(message) {
  process.stderr.write(`エラー: ${message}\n`);
  process.exit(1);
}

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token.startsWith("--")) {
      const [key, inlineValue] = token.slice(2).split("=");
      if (inlineValue !== undefined) {
        out[key] = inlineValue;
      } else if (argv[i + 1] && !argv[i + 1].startsWith("--")) {
        out[key] = argv[i + 1];
        i += 1;
      } else {
        out[key] = true;
      }
    } else {
      out._.push(token);
    }
  }
  return out;
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function packageMigrations() {
  const dir = join(PACKAGE_ROOT, "migrations");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.endsWith(".sql"))
    .sort();
}

function writeFile(target, contents, { force = false } = {}) {
  const absolute = resolve(CWD, target);
  if (existsSync(absolute) && !force) {
    log(`  skip   ${relative(CWD, absolute)}（既にあります）`);
    return false;
  }
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, contents);
  log(`  write  ${relative(CWD, absolute)}`);
  return true;
}

// --- sync-migrations / check-migrations -------------------------------------

function syncMigrations() {
  const names = packageMigrations();
  if (names.length === 0) fail("パッケージに migration が入っていません。");
  const targetDir = resolve(CWD, "migrations");
  mkdirSync(targetDir, { recursive: true });
  let changed = 0;
  for (const name of names) {
    const from = join(PACKAGE_ROOT, "migrations", name);
    const to = join(targetDir, name);
    const same =
      existsSync(to) && sha256(readFileSync(to)) === sha256(readFileSync(from));
    if (same) {
      log(`  same   migrations/${name}`);
      continue;
    }
    copyFileSync(from, to);
    log(`  copy   migrations/${name}`);
    changed += 1;
  }
  log(
    changed === 0
      ? "migration は最新です。"
      : `${changed} 件コピーしました。差分をコミットしてください。`
  );
}

function checkMigrations() {
  const names = packageMigrations();
  const targetDir = resolve(CWD, "migrations");
  const problems = [];
  for (const name of names) {
    const from = join(PACKAGE_ROOT, "migrations", name);
    const to = join(targetDir, name);
    if (!existsSync(to)) {
      problems.push(`missing: migrations/${name}`);
      continue;
    }
    if (sha256(readFileSync(to)) !== sha256(readFileSync(from))) {
      problems.push(`differs: migrations/${name}`);
    }
  }
  if (problems.length > 0) {
    for (const problem of problems) process.stderr.write(`  ${problem}\n`);
    fail("migration がパッケージと一致していません。`npx cf-pages-blog-admin sync-migrations` を実行してコミットしてください。");
  }
  log(`migration は一致しています（${names.length} 件）。`);
}

// --- init -------------------------------------------------------------------

const ROUTES = [
  {
    path: "functions/api/admin/me.ts",
    module: "server/handlers/me",
    factory: "createMeHandlers",
    exports: ["onRequestGet"],
  },
  {
    path: "functions/api/admin/auth/login.ts",
    module: "server/handlers/auth/login",
    factory: "createLoginHandlers",
    exports: ["onRequestPost"],
  },
  {
    path: "functions/api/admin/auth/logout.ts",
    module: "server/handlers/auth/logout",
    factory: "createLogoutHandlers",
    exports: ["onRequestPost"],
  },
  {
    path: "functions/api/admin/posts/index.ts",
    module: "server/handlers/posts/index",
    factory: "createPostsHandlers",
    exports: ["onRequestGet", "onRequestPost"],
  },
  {
    path: "functions/api/admin/posts/[id].ts",
    module: "server/handlers/posts/detail",
    factory: "createPostDetailHandlers",
    exports: ["onRequestGet", "onRequestPut", "onRequestDelete"],
  },
  {
    path: "functions/api/admin/posts/[id]/publish.ts",
    module: "server/handlers/posts/publish",
    factory: "createPublishHandlers",
    exports: ["onRequestPost"],
  },
  {
    path: "functions/api/admin/posts/[id]/unpublish.ts",
    module: "server/handlers/posts/unpublish",
    factory: "createUnpublishHandlers",
    exports: ["onRequestPost"],
  },
  {
    path: "functions/api/admin/categories/index.ts",
    module: "server/handlers/categories/index",
    factory: "createCategoriesHandlers",
    exports: ["onRequestGet", "onRequestPost"],
  },
  {
    path: "functions/api/admin/categories/[id].ts",
    module: "server/handlers/categories/detail",
    factory: "createCategoryDetailHandlers",
    exports: ["onRequestDelete"],
  },
  {
    path: "functions/api/admin/users/index.ts",
    module: "server/handlers/users/index",
    factory: "createUsersHandlers",
    exports: ["onRequestGet", "onRequestPost"],
  },
  {
    path: "functions/api/admin/users/[id].ts",
    module: "server/handlers/users/detail",
    factory: "createUserDetailHandlers",
    exports: ["onRequestPut", "onRequestDelete"],
  },
  {
    path: "functions/api/admin/assets/upload.ts",
    module: "server/handlers/assets/upload",
    factory: "createAssetUploadHandlers",
    exports: ["onRequestPost"],
  },
];

// ディレクトリと同名のルート（末尾スラッシュ無しでのアクセス）を賄う別名ファイル。
const ROUTE_ALIASES = [
  { path: "functions/api/admin/posts.ts", from: "./posts/index", exports: ["onRequestGet", "onRequestPost"] },
  { path: "functions/api/admin/categories.ts", from: "./categories/index", exports: ["onRequestGet", "onRequestPost"] },
  { path: "functions/api/admin/users.ts", from: "./users/index", exports: ["onRequestGet", "onRequestPost"] },
];

function relativeConfigImport(routePath) {
  // functions/api/admin/... からリポジトリ直下の blog-admin.config までの相対パス。
  const depth = routePath.split("/").length - 1;
  return `${"../".repeat(depth)}blog-admin.config`;
}

function routeFile(route) {
  const named = route.exports.join(", ");
  return `import { ${route.factory} } from "${PACKAGE_NAME}/${route.module}";
import { blogAdminConfig } from "${relativeConfigImport(route.path)}";

export const { ${named} } = ${route.factory}(blogAdminConfig);
`;
}

function aliasFile(alias) {
  return `export { ${alias.exports.join(", ")} } from "${alias.from}";\n`;
}

function assetsPublicFile() {
  return `export { onRequestGet } from "${PACKAGE_NAME}/server/handlers/assets/public";\n`;
}

// --- sync-routes / check-routes ---------------------------------------------

/**
 * 生成すべき再 export ファイルの一覧。中身は導入先ごとの設定に依存しないので、
 * init の対話を通さずにいつでも作り直せる。
 */
function routeTargets() {
  return [
    ...ROUTES.map((route) => ({
      path: route.path,
      contents: routeFile(route),
      exports: route.exports,
    })),
    ...ROUTE_ALIASES.map((alias) => ({
      path: alias.path,
      contents: aliasFile(alias),
      exports: alias.exports,
    })),
    {
      path: "functions/api/admin/assets/public/[key].ts",
      contents: assetsPublicFile(),
      exports: ["onRequestGet"],
    },
  ];
}

/**
 * 再 export の過不足を洗い出す。
 *
 * パッケージ側に API を足しても、導入先のこのファイルが古いままだと
 * 「パッケージは新しいのに画面の一部だけ動かない」状態になり、型検査もビルドも通ってしまう。
 * ここで見つけて CI で止める。
 */
/**
 * 比較用に空白を潰す。
 *
 * 「export 名がファイルに含まれるか」だけで見ると、名前がコメントに残っているファイルや、
 * 別のハンドラを繋いだファイルを通してしまうので、中身そのものを突き合わせる。
 * ただし導入先の formatter が改行位置を変えるだけの差で落とさないよう、空白は無視する。
 */
function normalizeRouteText(text) {
  return text.replace(/\s+/g, " ").trim();
}

function routeProblems() {
  const problems = [];
  for (const target of routeTargets()) {
    const absolute = resolve(CWD, target.path);
    if (!existsSync(absolute)) {
      problems.push({ target, reason: "ファイルがありません" });
      continue;
    }
    const text = readFileSync(absolute, "utf8");
    if (normalizeRouteText(text) === normalizeRouteText(target.contents)) continue;

    // 何がずれているかを一言で出す。export の不足が一番多く、次が繋ぎ先の違い。
    const lacking = target.exports.filter(
      (name) => !new RegExp(`\\bexport\\b[\\s\\S]{0,200}?\\b${name}\\b`).test(text)
    );
    problems.push({
      target,
      reason:
        lacking.length > 0
          ? `export が足りません: ${lacking.join(", ")}`
          : "内容がパッケージの定義と違います",
    });
  }
  return problems;
}

function checkRoutes() {
  const problems = routeProblems();
  if (problems.length > 0) {
    for (const problem of problems) {
      process.stderr.write(`  ${problem.target.path}: ${problem.reason}\n`);
    }
    fail(
      "Pages Functions の再 export がパッケージと一致していません。`npx cf-pages-blog-admin sync-routes` を実行してコミットしてください。"
    );
  }
  log(`再 export は一致しています（${routeTargets().length} 件）。`);
}

function syncRoutes() {
  const problems = routeProblems();
  if (problems.length === 0) {
    log("再 export は最新です。");
    return;
  }
  for (const problem of problems) {
    writeFile(problem.target.path, problem.target.contents, { force: true });
  }
  log(`${problems.length} 件を書き出しました。差分をコミットしてください。`);
}

function configFile(answers) {
  return `import { defineBlogAdminConfig } from "${PACKAGE_NAME}/config";

export const blogAdminConfig = defineBlogAdminConfig({
  clientId: ${JSON.stringify(answers.clientId)},
  defaultAuthor: ${JSON.stringify(answers.defaultAuthor)},
  sessionCookieName: "__Host-${answers.cookiePrefix}_admin_session",
  brandLabel: ${JSON.stringify(answers.brandLabel)},
  content: {
    postsDir: ${JSON.stringify(answers.postsDir)},
    heroImageKey: ${JSON.stringify(answers.heroImageKey)},
    defaultHeroImage: ${JSON.stringify(answers.defaultHeroImage || null)},
  },
  github: {
    owner: ${JSON.stringify(answers.githubOwner)},
    repo: ${JSON.stringify(answers.githubRepo)},
    branch: ${JSON.stringify(answers.githubBranch)},
  },
});
`;
}

function nextRouterAdapter() {
  return `"use client";

import NextLink from "next/link";
import { useSearchParams } from "next/navigation";
import type { AdminRouter } from "${PACKAGE_NAME}/ui";

export const adminRouter: AdminRouter = {
  Link: ({ href, className, children }) => (
    <NextLink href={href} className={className}>
      {children}
    </NextLink>
  ),
  navigate: (href) => window.location.assign(href),
  useSearchParam: (name) => useSearchParams().get(name),
};
`;
}

function wouterRouterAdapter() {
  return `import { Link as WouterLink, navigate } from "wouter/use-browser-location";
import type { AdminRouter } from "${PACKAGE_NAME}/ui";

export const adminRouter: AdminRouter = {
  Link: ({ href, className, children }) => (
    <WouterLink href={href} className={className}>
      {children}
    </WouterLink>
  ),
  navigate,
  useSearchParam: (name) =>
    new URLSearchParams(typeof window !== "undefined" ? window.location.search : "").get(
      name
    ),
};
`;
}

const NEXT_PAGES = [
  { path: "src/app/admin/login/page.tsx", component: "AdminLoginClient", suspense: false },
  { path: "src/app/admin/posts/page.tsx", component: "AdminPostsClient", suspense: false },
  { path: "src/app/admin/users/page.tsx", component: "AdminUsersClient", suspense: false },
  { path: "src/app/admin/editor/page.tsx", component: "AdminEditorClient", suspense: true },
];

function nextPageFile(page) {
  const depth = page.path.split("/").length - 1;
  const configImport = `${"../".repeat(depth)}blog-admin.config`;
  const body =
    page.component === "AdminLoginClient"
      ? `<${page.component} config={blogAdminConfig} />`
      : `<${page.component} config={blogAdminConfig} router={adminRouter} />`;

  if (!page.suspense) {
    return `import { ${page.component} } from "${PACKAGE_NAME}/ui";
import { blogAdminConfig } from "${configImport}";
${page.component === "AdminLoginClient" ? "" : 'import { adminRouter } from "@/components/admin/router-adapter";\n'}
export default function Page() {
  return ${body};
}
`;
  }

  // useSearchParams を使う画面は、静的書き出しのために Suspense 境界が要る。
  return `import { Suspense } from "react";
import { ${page.component} } from "${PACKAGE_NAME}/ui";
import { blogAdminConfig } from "${configImport}";
import { adminRouter } from "@/components/admin/router-adapter";

export default function Page() {
  return (
    <Suspense fallback={null}>
      ${body}
    </Suspense>
  );
}
`;
}

async function ask(rl, question, fallback) {
  const suffix = fallback ? `（既定: ${fallback}）` : "";
  const answer = (await rl.question(`${question}${suffix}: `)).trim();
  return answer || fallback || "";
}

async function collectAnswers(args) {
  const interactive = process.stdin.isTTY && !args["no-input"];
  const answers = {
    clientId: args["client-id"] || "",
    defaultAuthor: args.author || "",
    cookiePrefix: args["cookie-prefix"] || "",
    brandLabel: args.brand || "BLOG ADMIN",
    postsDir: args["posts-dir"] || "content/posts",
    heroImageKey: args["hero-key"] || "heroImage",
    defaultHeroImage: args["default-hero"] || "",
    githubOwner: "",
    githubRepo: "",
    githubBranch: args["github-branch"] || "main",
    framework: args.framework || "",
  };
  if (typeof args.github === "string" && args.github.includes("/")) {
    const [owner, repo] = args.github.split("/");
    answers.githubOwner = owner;
    answers.githubRepo = repo;
  }

  if (interactive) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    try {
      answers.clientId = await ask(rl, "client_id（D1 の client_id 列に入る値）", answers.clientId);
      answers.defaultAuthor = await ask(rl, "既定の著者名", answers.defaultAuthor);
      answers.cookiePrefix = await ask(
        rl,
        "セッション Cookie の接頭辞（__Host-<接頭辞>_admin_session）",
        answers.cookiePrefix || answers.clientId
      );
      answers.brandLabel = await ask(rl, "ログイン画面の見出しラベル", answers.brandLabel);
      answers.postsDir = await ask(rl, "記事 Markdown の出力先", answers.postsDir);
      answers.heroImageKey = await ask(rl, "frontmatter のアイキャッチキー", answers.heroImageKey);
      answers.defaultHeroImage = await ask(
        rl,
        "既定アイキャッチのパス（空なら設定しない）",
        answers.defaultHeroImage
      );
      const repoAnswer = await ask(
        rl,
        "公開先の GitHub リポジトリ（owner/repo）",
        answers.githubOwner ? `${answers.githubOwner}/${answers.githubRepo}` : ""
      );
      if (repoAnswer.includes("/")) {
        const [owner, repo] = repoAnswer.split("/");
        answers.githubOwner = owner;
        answers.githubRepo = repo;
      }
      answers.githubBranch = await ask(rl, "公開先ブランチ", answers.githubBranch);
      answers.framework = await ask(rl, "フロントの構成（nextjs / vite）", answers.framework || "nextjs");
    } finally {
      rl.close();
    }
  }

  if (!answers.framework) answers.framework = "nextjs";
  if (!answers.cookiePrefix) answers.cookiePrefix = answers.clientId;
  return answers;
}

function validate(answers) {
  if (!answers.clientId) fail("client_id は必須です（--client-id）。");
  if (!answers.defaultAuthor) fail("既定の著者名は必須です（--author）。");
  if (!/^[a-z0-9_]+$/.test(answers.cookiePrefix)) {
    fail("Cookie の接頭辞は英小文字・数字・アンダースコアだけにしてください（--cookie-prefix）。");
  }
  if (!["nextjs", "vite"].includes(answers.framework)) {
    fail("--framework は nextjs か vite のどちらかです。");
  }
}

async function init(args) {
  const answers = await collectAnswers(args);
  validate(answers);
  const force = Boolean(args.force);

  log("\n設定ファイル");
  writeFile("blog-admin.config.ts", configFile(answers), { force });

  log("\nPages Functions（再 export）");
  for (const target of routeTargets()) writeFile(target.path, target.contents, { force });

  log("\nルーターアダプタ");
  if (answers.framework === "nextjs") {
    writeFile("src/components/admin/router-adapter.tsx", nextRouterAdapter(), { force });
    log("\n管理画面のページ");
    for (const page of NEXT_PAGES) writeFile(page.path, nextPageFile(page), { force });
  } else {
    writeFile("client/src/components/admin/router-adapter.tsx", wouterRouterAdapter(), {
      force,
    });
  }

  log("\nD1 migration");
  const template = readFileSync(
    join(PACKAGE_ROOT, "templates", "0001_admin_editor.sql.tpl"),
    "utf8"
  );
  writeFile(
    "migrations/0001_admin_editor.sql",
    template
      .replaceAll("{{clientId}}", answers.clientId.replaceAll("'", "''"))
      .replaceAll("{{defaultAuthor}}", answers.defaultAuthor.replaceAll("'", "''")),
    { force }
  );
  syncMigrations();

  const cssPath =
    answers.framework === "nextjs" ? "src/app/globals.css" : "client/src/index.css";
  log(`
残りの手順:

1. ${cssPath} の @import "tailwindcss"; の直後に次の1行を足す
   @source "../../node_modules/${PACKAGE_NAME}/dist";
   （足さないとビルドは通るのに管理画面だけ素の見た目になります）

2. wrangler.toml に D1（binding = "ADMIN_DB"）と R2（binding = "ADMIN_ASSETS"）を書く

3. package.json に次を足す
   "typecheck:functions": "tsc --noEmit -p functions/tsconfig.json"
   "check:routes": "cf-pages-blog-admin check-routes"
   "db:migrate": "wrangler d1 migrations apply <DB名> --remote"

4. npm run db:migrate でスキーマを流し、管理ユーザーを1人作る

5. Cloudflare Pages のシークレットに GITHUB_TOKEN を登録する
${answers.framework === "vite" ? "\n6. ルーター定義に /admin/login /admin/posts /admin/editor /admin/users を足す（examples/vite-wouter を参照）\n" : ""}`);
}

// --- entry ------------------------------------------------------------------

const args = parseArgs(process.argv.slice(2));
const command = args._[0];

switch (command) {
  case "init":
    await init(args);
    break;
  case "sync-migrations":
    syncMigrations();
    break;
  case "check-migrations":
    checkMigrations();
    break;
  case "sync-routes":
    syncRoutes();
    break;
  case "check-routes":
    checkRoutes();
    break;
  default:
    log(`cf-pages-blog-admin <command>

  init              足場（設定・再 export・ページ・migration）を生成する
  sync-migrations   パッケージの migration を ./migrations へコピーする
  check-migrations  コピーがパッケージと一致しているか検証する
  sync-routes       Pages Functions の再 export を過不足なく揃える
  check-routes      再 export がパッケージのルート定義と一致しているか検証する

init の主なオプション:
  --client-id <値>      D1 の client_id
  --author <値>         既定の著者名
  --cookie-prefix <値>  __Host-<値>_admin_session
  --brand <値>          ログイン画面の見出しラベル
  --posts-dir <値>      記事 Markdown の出力先（既定 content/posts）
  --hero-key <値>       frontmatter のアイキャッチキー（既定 heroImage）
  --default-hero <値>   既定アイキャッチのパス
  --github <owner/repo> 公開先リポジトリ
  --github-branch <値>  公開先ブランチ（既定 main）
  --framework <値>      nextjs | vite（既定 nextjs）
  --no-input            対話せず引数だけで生成する
  --force               既存ファイルを上書きする
`);
    if (command) process.exit(1);
}
