#!/usr/bin/env node
// 公開してはいけないものが混入していないか検査する。
// 初回コミット前と、以後の CI の両方で回す。
//
// 一部のパターンを \u エスケープで書いているのは、検査対象の文字列をこのファイル自身が
// 含むと必ず自己検出してしまうため。意味は各定義のコメントに書いてある。
// 公開リポジトリに置けない語（導入先の固有名詞など）を足したいときは、
// 環境変数 PUBLIC_SAFE_EXTRA_PATTERN に正規表現を入れて実行する。

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const ROOT = resolve(process.argv[2] || ".");
const SKIP_DIRS = new Set([".git", "node_modules", "dist", ".next", "out"]);
// 検査パターンを持つファイル自身は対象外にする（パターンがパターンに一致してしまうため）。
// CLAUDE.local.md は .gitignore 済みで、公開できない具体名を置くための場所。
// 検査すると必ず引っかかるが、コミットされないので公開のしようがない。
const SKIP_FILES = new Set([
  "package-lock.json",
  "check-public-safe.mjs",
  "CLAUDE.local.md",
]);
const BINARY_EXTENSIONS = /\.(png|jpe?g|gif|webp|ico|pdf|woff2?|ttf|zip|tgz)$/i;

const CHECKS = [
  {
    label: "資格情報",
    pattern: /sk-[A-Za-z0-9]{10}|gho_|ghp_|ghs_|github_pat_|eyJ[A-Za-z0-9]|AIza[0-9A-Za-z_-]|-----BEGIN/,
  },
  {
    label: "環境識別子",
    pattern: /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/,
  },
  {
    label: "連絡先",
    pattern: /@gmail|co\.jp|pages\.dev|0[0-9]{1,4}-[0-9]{2,4}-[0-9]{4}/,
  },
  {
    // 一人称（われわれ）・自社（へいしゃ）・取引相手（こきゃく）を指す語と、
    // 記事の生成手段に触れる語（AI による記事の作成）。
    // 導入先との関係が読み取れる文をコードに残さないための検査。
    // このファイル自身が検査対象に含まれるため、パターンは \u エスケープで書く。
    label: "関係の表現",
    pattern: /\u6211\u3005|\u5f0a\u793e|\u9867\u5ba2|AI \u306b\u3088\u308b\u8a18\u4e8b\u751f\u6210/,
  },
];

if (process.env.PUBLIC_SAFE_EXTRA_PATTERN) {
  CHECKS.push({
    label: "追加パターン",
    pattern: new RegExp(process.env.PUBLIC_SAFE_EXTRA_PATTERN),
  });
}

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry) || SKIP_FILES.has(entry)) continue;
    const full = join(dir, entry);
    const info = statSync(full);
    if (info.isDirectory()) {
      yield* walk(full);
    } else if (info.isFile() && !BINARY_EXTENSIONS.test(entry)) {
      yield full;
    }
  }
}

let failures = 0;
for (const file of walk(ROOT)) {
  let lines;
  try {
    lines = readFileSync(file, "utf8").split("\n");
  } catch {
    continue;
  }
  lines.forEach((line, index) => {
    for (const check of CHECKS) {
      if (check.pattern.test(line)) {
        process.stderr.write(
          `${relative(ROOT, file)}:${index + 1}: [${check.label}] ${line.trim()}\n`
        );
        failures += 1;
      }
    }
  });
}

if (failures > 0) {
  process.stderr.write(`公開前チェック: ${failures} 件検出しました。\n`);
  process.exit(1);
}
process.stdout.write("公開前チェック: 検出なし\n");
