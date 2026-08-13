# cf-pages-blog-admin

Cloudflare Pages + D1 + R2 で動く、日本語向けのブログ管理画面パッケージ。
記事は Markdown として GitHub にコミットされ、静的サイトジェネレータがそれを読む。

サーバー側（Pages Functions のハンドラ）、管理画面 UI（React）、D1 の migration、
設定の型定義までを1つのパッケージにまとめてある。導入側に置くのは薄い再 export と設定ファイルだけ。

## できること

- メール／パスワードのログイン（PBKDF2、`__Host-` Cookie、試行回数制限）
- 3段階の権限（`admin` / `client_publisher` / `client_viewer`）とユーザー管理
  （`client_viewer` は閲覧専用。編集系のボタンは画面側でも無効になる）
- 記事の下書き・改訂履歴・公開・公開取り下げ
- リッチテキストエディタ（Markdown と相互変換）
- 画像アップロード（ブラウザ側でリサイズ、マジックナンバー検査、R2 から配信）
- カテゴリ管理

## 前提

- Cloudflare Pages Functions / D1 / R2 / GitHub Contents API
- フロントは Next.js（App Router）と Vite + wouter で動作確認している。
  サーバー側は Pages Functions のほか、Workers 上の Next.js の Route Handler でも動く
  （`server/adapters/next` の `toRouteHandlers()` を使う）
- 導入側の `functions/tsconfig.json` に `@cloudflare/workers-types` が入っていること
  （このパッケージはそれを `dependencies` に持たない）

## インストール

npm レジストリには publish していない。public リポジトリの git 依存として入れる。認証は不要。

```
npm i "github:5Y1U5/cf-pages-blog-admin#v1.0.2"
```

## 使い方

```
npx cf-pages-blog-admin init
```

対話で `client_id` / 既定の著者名 / Cookie の接頭辞 / 公開先リポジトリ / 記事ディレクトリ を聞き、
次を生成する。

- `blog-admin.config.ts`（リポジトリ直下）
- `functions/api/admin/**` の再 export 16ファイル
- `src/app/admin/**/page.tsx`（Next.js の場合）
- `src/components/admin/router-adapter.tsx`
- `migrations/0001_admin_editor.sql`（テンプレートから生成）と、パッケージが配る migration のコピー

生成後に手で入れるものが3つある。

1. Tailwind のスキャン対象を足す（**入れ忘れると、ビルドは通るのに管理画面だけ素の見た目になる**）

   ```css
   /* src/app/globals.css（Vite なら client/src/index.css）*/
   @import "tailwindcss";
   @source "../../node_modules/@5y1u5/cf-pages-blog-admin/dist";
   ```

2. `wrangler.toml` のバインディング（名前は固定）

   ```toml
   [[d1_databases]]
   binding = "ADMIN_DB"

   [[r2_buckets]]
   binding = "ADMIN_ASSETS"
   ```

3. Cloudflare Pages のシークレットに `GITHUB_TOKEN`（Contents の読み書き権限）

そのあと `wrangler d1 migrations apply <DB名> --remote` でスキーマを流し、管理ユーザーを1人作る。

### 再 export の形

ルーティングを決めるのは `functions/` にファイルが存在することだけなので、
中身は設定を渡してハンドラを組み立てるだけでよい。

```ts
// functions/api/admin/posts/[id].ts
import { createPostDetailHandlers } from "@5y1u5/cf-pages-blog-admin/server/handlers/posts/detail";
import { blogAdminConfig } from "../../../../blog-admin.config";

export const { onRequestGet, onRequestPut, onRequestDelete } =
  createPostDetailHandlers(blogAdminConfig);
```

設定を必要としないのは R2 の配信ハンドラだけで、これは素通しでよい。

```ts
// functions/api/admin/assets/public/[key].ts
export { onRequestGet } from "@5y1u5/cf-pages-blog-admin/server/handlers/assets/public";
```

### 画面の組み込み

コンポーネントは設定とルーターアダプタを受け取る。
`next/link` や `wouter` といったフレームワーク依存はアダプタ側に閉じ込めてある。

```tsx
import { AdminPostsClient } from "@5y1u5/cf-pages-blog-admin/ui";
import { blogAdminConfig } from "../../../../blog-admin.config";
import { adminRouter } from "@/components/admin/router-adapter";

export default function Page() {
  return <AdminPostsClient config={blogAdminConfig} router={adminRouter} />;
}
```

実例は `examples/nextjs`（Pages Functions）、`examples/vite-wouter`、
`examples/nextjs-route-handlers`（Workers 上の Next.js で API を `app/api/**/route.ts` に置く構成）にある。

## 設定

`defineBlogAdminConfig()` に渡す。必須は3項目だけで、残りは既定値が入る。

| 項目 | 既定値 | 説明 |
|---|---|---|
| `clientId` | **必須** | D1 の `client_id` 列に入る値。既存データと必ず一致させる |
| `defaultAuthor` | **必須** | frontmatter の `author` と `post_drafts.author` の既定値 |
| `sessionCookieName` | **必須** | `__Host-` 接頭辞つきのセッション Cookie 名 |
| `brandLabel` | `"BLOG ADMIN"` | ログイン画面の見出しに出す短いラベル |
| `content.postsDir` | `"content/posts"` | 記事 Markdown の出力先 |
| `content.heroImageKey` | `"heroImage"` | frontmatter のアイキャッチキー |
| `content.defaultHeroImage` | `null` | 本文にも指定にも画像が無いときの既定アイキャッチ。`null` なら出さない |
| `content.categoriesJsonPath` | `"content/blog-categories.json"` | カテゴリ一覧の書き出し先 |
| `category.defaultSlug` | `"news"` | 既定カテゴリの slug |
| `category.defaultLabel` | `"お知らせ"` | 既定カテゴリの表示名 |
| `category.preferredSlugs` | `["news"]` | 既定カテゴリの探索順 |
| `publish.requiredFields` | `["title","body"]` | 公開に必須の項目 |
| `publish.timezoneOffsetMinutes` | `540` | 公開日の基準タイムゾーン（分） |
| `publish.blockFutureDate` | `true` | 未来日での公開を拒否するか |
| `publish.publicPathPrefix` | `"/blog"` | 公開 URL の接頭辞。**サイトの実際の記事 URL に合わせる** |
| `github.owner` / `repo` / `branch` | `""` / `""` / `"main"` | 公開先。環境変数が設定されていればそちらが優先される |
| `github.mode` | `"source"` | `"source"`＝コミットが記事の実体。失敗したら公開しない。`"backup"`＝実体は D1。失敗しても公開は成立し `warning` を返す |
| `permissions.deletePost` | `["admin"]` | 記事の物理削除を許可するロール |

環境変数（Pages の設定）で扱うもの:

| 変数 | 用途 |
|---|---|
| `GITHUB_TOKEN` | **シークレット。** Contents の読み書き権限が要る |
| `GITHUB_OWNER` / `GITHUB_REPO` / `GITHUB_BRANCH` | 設定ファイルの `github.*` を上書きしたいときだけ |
| `ASSET_PUBLIC_BASE_URL` | R2 を独自ドメインから配る場合の公開ベース URL。未設定なら `/api/admin/assets/public/<key>` |

設定項目の追加漏れは、導入側の `tsc --noEmit -p functions/tsconfig.json` が検出する。
CI に必ず入れておくこと。

### 公開 URL の接頭辞（`publish.publicPathPrefix`）

公開 URL は `<publicPathPrefix>/<slug>` として組み立てられ、次の3か所に出る。

- 公開後に管理画面が表示する「公開したページ」へのリンク
- 記事一覧の「サイトで見る」リンク
- 記事削除の確認ダイアログの文言（「この URL が 404 になります」の URL）

**サイトの実際の記事 URL に合わせて必ず設定する。** 既定は `/blog` なので、
記事を `/post/<slug>/` で配信しているサイトで既定のままにすると、
削除確認ダイアログに存在しない URL が出て、利用者が「別の記事を消そうとしている」と誤解する。

```ts
publish: {
  publicPathPrefix: "/post",   // → /post/<slug>
},
```

DB に保存済みの `published_url` があるときはそちらを優先して表示するため、
設定を直したあとに再公開した記事から順に正しい URL になる。

### 既定カテゴリの決まり方

新規記事を開いたときの初期選択と、公開時にカテゴリ未指定だった場合の自動補完は、
同じ順序で決まる。

1. `category.preferredSlugs` の並び順に、登録済みカテゴリから探す
2. 見つからなければ `category.defaultSlug` と一致する登録済みカテゴリ
3. それも無ければ登録順の先頭
4. カテゴリが1件も無ければ `defaultSlug` / `defaultLabel` を振る（公開時のみ）

登録順の先頭が既定になるわけではない。ほぼ毎日「お知らせ」を書くサイトで、
先に登録されたカテゴリが「ブログ」だとしても、`preferredSlugs: ["news"]` なら
新規記事の初期選択は「お知らせ」になる。

### `requiredFields` と slug

`publish.requiredFields` はサーバー側の公開処理が検証する。
ただし **`slug` は画面側の未入力判定からは除外される**。

新規記事の slug はサーバーが保存時に必ず埋めるためで、タイトルから作れない場合
（日本語だけのタイトルなど）は `post-<日付>-<乱数>` を採番し、既存と衝突する場合は連番を付ける。
画面側で空欄を「未入力」と扱うと、日本語タイトルの新規記事で公開ボタンが押せないまま詰む。

`requiredFields` に `slug` を入れる指定自体は有効で、サーバー側の検証はそのまま働く。
未保存の新規記事でも公開ボタンは押せて、押すと保存してから公開が走る。

## パスワードの扱い（設計上の性質）

**管理者が新規ユーザーを作ると、初期パスワードが一度だけ画面に表示される。**
パスワード再発行のときも同じで、再発行後のパスワードがその場に一度だけ出る。

- サーバーは平文を保存しない。D1 に入るのは PBKDF2-HMAC-SHA256 のハッシュだけ
- したがって**表示された画面を離れると二度と確認できない**。伝え忘れた場合は再発行する
- ユーザー一覧 API はハッシュも平文も返さない
- 初期パスワードは 14 文字・57 種の英数字（見間違えやすい文字を除外）から生成する

管理者アカウントを奪われた場合に得られるのは「その時点で新規作成・再発行したパスワード」だけで、
既存ユーザーの過去のパスワードを遡って読むことはできない。

## D1 migration

`0001` は導入時にテンプレートから生成するもので、以後はパッケージが配る。

```
npx cf-pages-blog-admin sync-migrations    # パッケージ → ./migrations/ へコピーする
npx cf-pages-blog-admin check-migrations   # コピーがパッケージと一致しているか検証する（CI 用）
```

コピーはコミットする。`wrangler d1 migrations apply` は `migrations/` を見るため、
導入側固有の migration と同じディレクトリに並んでいる必要がある。

適用は自動化していない。デプロイの前段に `check-migrations` と
`wrangler d1 migrations list --remote` を置き、**未適用があればデプロイを止める**運用を勧める。

## バージョニング

semver。タグは `v1.2.3` 形式で、`package.json` の `version` と必ず一致させる。
次のいずれかを含む変更は major にする。

1. 設定に必須項目が増えた、または型が変わった
2. D1 の migration が増えた
3. API のリクエスト／レスポンス形が変わった
4. 画面や挙動が利用者から見て変わった
5. peer dependency のメジャーが上がった

破壊的変更の内容は `CHANGELOG.md` に書く。

## 開発

```
npm install
npm run check    # 型検査 → 公開前チェック → クラス名チェック → ビルド
```

`dist` はリポジトリにコミットする（git 依存でそのまま install できるようにするため）。
`src` を直したら `npm run build` して `dist` も一緒にコミットすること。CI がずれを検出する。

## ライセンス

MIT
