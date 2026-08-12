#!/usr/bin/env node
// Tailwind のクラス名を文字列連結で組み立てていないか検査する。
//
// `text-${color}-600` のようにクラス名の途中で式を埋めると、Tailwind の静的解析が拾えず
// そのクラスだけ生成されない（ビルドは通るのに見た目だけ崩れる）。
// 単語の途中に埋め込みがある場合だけを検出し、`... ${cond ? "a" : "b"}` のように
// 空白で区切ってクラス文字列を丸ごと切り替える書き方は許す。

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const ROOT = resolve(process.argv[2] || "src/ui");
const INTERPOLATION_INSIDE_TOKEN = /[A-Za-z0-9_\-[\]]\$\{/;

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const info = statSync(full);
    if (info.isDirectory()) yield* walk(full);
    else if (/\.tsx?$/.test(entry)) yield full;
  }
}

let failures = 0;
for (const file of walk(ROOT)) {
  const lines = readFileSync(file, "utf8").split("\n");
  let insideClassName = false;
  lines.forEach((line, index) => {
    if (/class(Name)?=\{/.test(line)) insideClassName = true;
    if (insideClassName && INTERPOLATION_INSIDE_TOKEN.test(line)) {
      process.stderr.write(`${relative(process.cwd(), file)}:${index + 1}: ${line.trim()}\n`);
      failures += 1;
    }
    // 波括弧が閉じたら className の外に出たとみなす（行内で完結する書き方が大半）。
    if (insideClassName && /\}\s*$/.test(line)) insideClassName = false;
  });
}

if (failures > 0) {
  process.stderr.write(
    "クラス名の途中で式を埋め込んでいます。クラス文字列は丸ごと切り替えてください。\n"
  );
  process.exit(1);
}
process.stdout.write("クラス名チェック: 検出なし\n");
