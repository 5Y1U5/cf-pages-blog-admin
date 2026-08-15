# 開発の約束ごと

## ビルドと検査

```
npm install
npm run check
```

`check` は次を順に回す。

1. `typecheck` — サーバー側（Workers の型）と UI 側（DOM の型）を別々に検査する
2. `check:safe` — 公開してはいけないものが混入していないか検査する
3. `check:classnames` — Tailwind のクラス名を文字列連結で組み立てていないか検査する
4. `build` — `dist` を作り直す
5. `test` — `node:sqlite` で D1 を模し、`dist` のハンドラを Pages Functions と同じ形で呼ぶ

### 型検査が2本ある理由

Cloudflare Workers の型（`@cloudflare/workers-types`）と DOM の型は、`Response` や `fetch` などを
それぞれ宣言していて同じプログラムに同居できない。そのため

- `tsconfig.server.json` — `src/server` を Workers の型で
- `tsconfig.ui.json` — `src/ui` を DOM の型で

の2本に分けている。`src/config` は両方から import されるので、
**Cloudflare の型を参照するものは `src/config/env.ts` に隔離してある**。
`src/config/index.ts` に `D1Database` などを持ち込まないこと。持ち込むと、
導入先の Next.js / Vite 側のビルドに Workers の型が流れ込んで衝突する。

エディタは `tsconfig.json`（UI 側の設定）を既定で拾う。`src/server` を触るときは
`tsconfig.server.json` を選ぶ。

## `dist` はコミットする

git 依存でそのまま install できるようにするため、`dist` をリポジトリに入れている。
`prepare` でビルドする方式は使わない（パッケージマネージャによっては install が失敗する、
`--ignore-scripts` を付けると無言で壊れる、といった問題があるため）。

`src` を直したら `npm run build` して `dist` も同じコミットに含めること。CI がずれを検出する。
レビュー時に `dist` を畳みたければ `git diff -- . ':(exclude)dist'`。

## Tailwind のクラス名は文字列連結で組み立てない

```tsx
// だめ: Tailwind の静的解析が拾えず、そのクラスだけ生成されない
<span className={`text-${color}-600`} />

// よい: クラス文字列を丸ごと切り替える
<span className={active ? "text-amber-600" : "text-foreground/70"} />
```

`npm run check:classnames` が単語の途中に埋め込みがある書き方だけを検出する。
`` `flex h-9 ${active ? "a" : "b"}` `` のように空白で区切る書き方は許している。

## パッケージに書いてよいこと・書いてはいけないこと

このリポジトリは公開されている。導入先が特定できる情報を残さない。

- 導入先の名称・略称・ドメイン・リポジトリ名を、コード・コメント・テストに書かない
  （すべて設定経由にする）
- 導入者と利用者の関係が読み取れる書き方をしない。中立な技術説明にする
- コメントで参照するパスは、このパッケージ内のパス（`server/_shared/...` など）にする。
  導入先のディレクトリ構成を前提にしたパスを書かない

`npm run check:safe` が機械的に検査する。導入先固有の語を一時的に足して検査したいときは、
環境変数で渡す。

```
PUBLIC_SAFE_EXTRA_PATTERN='社名A|社名B' npm run check:safe
```

## リリース

```
npm version <patch|minor|major>
```

`preversion` で `check`、`version` でビルドと `dist` の `git add`、`postversion` で
タグ付き push が走る。**タグは付け替えない。** 間違えたら次の patch を出す。

major に倒す条件は README の「バージョニング」を参照。
