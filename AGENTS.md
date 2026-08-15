# cf-pages-blog-admin — AI 向け作業指示

## このリポジトリの位置づけ

ブログ管理画面（`/admin`）の本体。複数の導入先サイトが git 依存としてこれを参照している。
**管理画面の不具合修正・機能追加は、導入先ではなく必ずここで行う。**

以前は同じコードが各サイトにコピーで置かれていて、1箇所直すたびに全サイトで同じ作業をしていた。
その状態に戻さないことが、このリポジトリの存在意義そのもの。

導入先の一覧・ローカルパス・個別の事情は `CLAUDE.local.md`（git 管理外）に置く。
このリポジトリは公開されているため、導入先を特定できる情報をコミットしてはいけない
（`npm run check:safe` が検査する。詳細は CONTRIBUTING.md）。

## 変更が導入先へ届くまで

```
ここを直す → npm version <patch|minor|major> → タグが push される
   → Renovate が各導入先に更新 PR を自動で立てる
   → 各導入先の CI（型検査・Functions 型検査・migration 照合・ビルド）が通る
   → 夜間（21時以降）に自動マージ → デプロイ
```

つまり **タグを打つところまでが作業範囲**で、各導入先のリポジトリを手で触る必要はない。
急がないなら翌朝には全サイトへ反映されている。

- `major` は自動マージされない（人が確認する）。major に倒す条件は README「バージョニング」
- 導入先の CI が落ちたら PR は止まる。落ちた導入先を見に行くこと
- タグは付け替えない。間違えたら次の patch を出す

### 導入先を先に見に行くべきケース

- **設定に必須項目を足した / 型を変えた** → 導入先の `blog-admin.config.ts` に追記が要る。
  導入先の `typecheck:functions` が検出するので CI は止まるが、先に手を打つほうが早い
- **migration を足した** → 導入先で `npx cf-pages-blog-admin sync-migrations` を流し、
  本番 D1 へ適用してからデプロイする。**適用 → デプロイの順を必ず守る**
  （列が無い状態で参照するコードを先に出すと管理画面が全滅する）
- **新しい API エンドポイントを足した** → 導入先に `functions/api/admin/**` の再 export を
  1枚足す作業が発生する。これは Renovate の更新 PR では配れないので、
  **既存のルートに載せられないか先に考えること**（`PUT /api/admin/users/me` がその例）。
  どうしても足すなら `bin` の `ROUTES` に定義し、導入先で
  `npx cf-pages-blog-admin sync-routes` を流す。ずれは `check-routes` が CI で検出する
- **画面の見た目が変わる** → 稼働中サイトは事前に周知が要ることがある

## 新しいサイトを導入するとき

管理画面のコードをコピーする作業は無い。導入先で次の3つをやるだけ。

1. `npm i "github:5Y1U5/cf-pages-blog-admin#v<最新タグ>"` して `npx cf-pages-blog-admin init`
   設定ファイル・`functions/api/admin/**` の再export・ルーターアダプタが生成される
2. README「使い方」の手作業3点（Tailwind の `@source` / wrangler のバインディング /
   `GITHUB_TOKEN` のシークレット）と、CI への `typecheck:functions` と `check:migrations` 追加
   `GITHUB_TOKEN` は fine-grained PAT を **Expiration「No expiration」・Only select repositories
   でそのリポジトリだけ・Contents 読み書きのみ** で作る。期限付きにすると、切れたときに
   公開が静かに止まる（導入先ごとの保管先は CLAUDE.local.md）
3. `renovate.json` を既存の導入先からコピーして置き、
   GitHub の Renovate App の対象リポジトリにそのリポジトリを追加（設定画面での操作が要る）

フレームワーク別の実例は `examples/nextjs` と `examples/vite-wouter`。
Vite + wouter 側は `client/src/` 配下に置く構成を前提にしている。

`@source` の入れ忘れは**ビルドも型検査も通るのに管理画面だけ素の見た目になる**。
効いているかは `@source` を消してビルドし直し、CSS のバイト数を比べるのが確実。
クラス名を grep するときは `text-[13px]` が CSS 側で `.text-\[13px\]` にエスケープされる点に注意。

## 触るときの決まりごと

- `src` を直したら `npm run build` して `dist` を同じコミットに含める（CI がずれを検出する）
- `src/config/index.ts` に Cloudflare の型を持ち込まない（`src/config/env.ts` に隔離してある）
- Tailwind のクラス名を文字列連結で組み立てない
- 導入先の名称・ドメイン・リポジトリ名をコードやコメントに書かない

開発・リリースの詳細は CONTRIBUTING.md、設定項目と API は README.md を読むこと。
