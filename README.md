# cf-pages-blog-admin

Cloudflare Pages + D1 + R2 で動く、日本語向けのブログ管理画面パッケージ。
記事は Markdown として GitHub にコミットされ、静的サイトジェネレータがそれを読む。

サーバー側（Pages Functions のハンドラ）、管理画面 UI（React）、D1 の migration、
設定の型定義までを1つのパッケージにまとめてある。導入側に置くのは薄い再 export と設定ファイルだけ。

## できること

- メール／パスワードのログイン（PBKDF2、`__Host-` Cookie、試行回数制限）
- 本人によるパスワード変更（管理者が発行したパスワードのままなら変更を促す）
- 3段階の権限（`admin` / `client_publisher` / `client_viewer`）とユーザー管理
  （`client_viewer` は閲覧専用。編集系のボタンは画面側でも無効になる）
- 操作ログ（誰がいつ公開・削除・ユーザー操作をしたか）
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
npm i "github:5Y1U5/cf-pages-blog-admin#v2.0.0"
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

## 本文のブロック記法

写真を使わない記事でも読み進められるよう、本文に差し込む視覚要素を Markdown から書ける。
生の HTML を本文に許すのではなく、決まった5種類だけを記法で受ける
（公開側のサニタイズを外さずに済み、書き手が増えても崩れない）。

```
:::callout 今日の見方
最初の3口だけ、箸を置いてから飲み込む。
:::

:::points
場面 01 | 昼休みが短く、時計を見ながら食べる。
場面 02 | スマホや動画を見ながら食べる。
:::

:::compare
続きにくい目標 | 毎食、全部を30回噛むと決める。
始めやすい目標 | 最初の3口だけ、箸を置いてから飲み込む。
:::

:::stat 29%
健康管理アプリの3ヶ月後の継続率
:::

:::faq
何回噛めばよいですか？ | まずは最初の3口だけ箸を置くところから始めましょう。
:::
```

公開側では Markdown 変換の前後をこのパッケージに任せる。Markdown 本体の変換だけ渡す
（公開側は remark、編集画面は marked と使うライブラリが違うため）。

```ts
import { renderArticleHtmlAsync } from "@5y1u5/cf-pages-blog-admin/content/article-blocks";

const html = await renderArticleHtmlAsync(markdown, (source) =>
  remark().use(remarkGfm).use(remarkHtml, { sanitize: true }).process(source).then(String)
);
```

CSS のひな形は `docs/article-blocks.css`。色の変数3つを差し替えれば使える。

- 中身は必ずエスケープしてから組み立てる。リンクは http/https のみ、強調は `**...**` のみ通す
- 閉じ忘れたブロックは Markdown としてそのまま出す（記事が消えるより崩れて見えるほうがよい）
- 編集画面のプレビューはラベルだけの簡易表示。実際の見た目は公開ページの CSS が決める

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
| `content.postTypes` | `[]` | 記事の区分。空なら区分なし。指定すると編集画面に選択が出て、公開 URL も区分ごとになる |
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
| `automation.tokenEnvVar` | `null` | ブラウザを介さない書き込みを通す Bearer トークンの環境変数名。`null` ならこの経路は開かない |
| `automation.role` | `"client_publisher"` | トークンが一致したときに与えるロール |
| `automation.user` | `{ id: "automation", email: "", name: "Automation" }` | `created_by` / `updated_by` に残る利用者 |

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

### ブラウザを介さない書き込み（`automation`）

記事生成を自動化していて、外部のプログラムが管理画面と同じ API を叩く場合、
Cookie セッションを張れないので `Authorization: Bearer <token>` で通す。

```ts
automation: {
  tokenEnvVar: "BLOG_AUTOMATION_TOKEN",   // Pages のシークレットに入れる
  role: "client_publisher",
  user: { id: "automation", email: "", name: "自動投稿" },
},
```

- **既定は `tokenEnvVar: null` で、この経路は開かない。** 名前を指定しても、
  その環境変数が未設定なら不成立のまま
- トークンは32文字以上でないと成立しない
- 一致・不一致にかかわらず同じ回数だけ比較するので、応答時間から答えは漏れない
- 通ったリクエストは `automation.user` として扱われ、`created_by` / `updated_by` に残る

### 記事の区分（`content.postTypes`）

1つのサイトで「お知らせ」と「ブログ」のように、置き場所と URL が分かれている場合に使う。

```ts
content: {
  postTypes: [
    { value: "news", label: "お知らせ", publicPathPrefix: "/news" },
    { value: "blog", label: "ブログ", publicPathPrefix: "/blog" },
  ],
},
```

- 既定は空配列。指定しなければ従来どおり単一の記事一覧として動く
- 指定すると編集画面に区分の選択が出る（2つ以上あるときだけ表示）
- 公開 URL は区分の `publicPathPrefix` が `publish.publicPathPrefix` より優先される
- 先頭の要素が新規記事の既定値。未知の値が来たときも先頭に寄せる
- D1 には `post_type` 列（migration 0005）で入る。区分を使わないサイトでは常に空文字

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

### 本人による変更

発行したパスワードは、本人に渡すまでの経路（チャットやメール）に平文が残る。
そこが実際の漏洩経路になるので、受け取った本人が自分のパスワードに変えるまでを1セットにしてある。

- `PUT /api/admin/users/me` に `currentPassword` と `newPassword` を送ると本人が変更できる
  （権限を問わない。現在のパスワードが必須）
- 新規作成・再発行で `users.must_change_password` が立つ。立っているあいだ、サーバーは
  **パスワードの変更と `GET /api/admin/me` 以外のすべてを 403 で止める**
  （`error: "password_change_required"`）。画面を出さないだけでは API を直接叩けば
  素通りしてしまうので、止めるのはサーバー側
- 管理画面は記事一覧・編集・ユーザー管理のどこを開いても変更フォームを出す。変更するまで閉じられない
- 変更すると**自分の他のセッションだけ**失効する（いま操作している画面はそのまま使える）
- 新しいパスワードは 12 文字以上・空白なし
- 自動投稿（`automation`）のトークンは users に実在しない利用者なので、この制限を受けない

この機能に専用のエンドポイントを足していないのは、**新しいルートを足すと導入先に
`functions/api/admin/**` の再 export を1枚追加する作業が発生し、それは Renovate の更新 PR では
配れない**ため。既存のルートに載せてあるので、パッケージを上げるだけで届く。

## 操作ログ

`audit_logs` テーブルに、ログイン・ログアウト・パスワード変更・記事の作成／公開／取り下げ／削除・
ユーザーの追加／変更／削除／パスワード再発行・カテゴリの追加／削除・画像アップロードを記録する。
ユーザー管理画面の下部に直近 50 件が出る（`admin` のみ）。

- 記事の本文は残さない（実体は `post_drafts` と GitHub のコミット履歴にある）
- 記録に失敗しても本処理は止めない。`audit_logs` が無いサイトでも管理画面は動く
- 保存期間は 365 日。古い行はログインのたびにまとめて消す

## 再 export の同期

パッケージ側に API を足したとき、導入先の `functions/api/admin/**` が古いままだと
**型検査もビルドも通るのに、その API だけ 404 になる**。CI で検出できるようにしてある。

```
npx cf-pages-blog-admin sync-routes    # 足りない再 export を書き出す
npx cf-pages-blog-admin check-routes   # パッケージのルート定義と一致しているか検証する（CI 用）
```

`package.json` に `"check:routes": "cf-pages-blog-admin check-routes"` を足し、
`typecheck:functions` と同じところで CI に流すこと。

対象は `functions/api/admin/**` に置く Pages Functions 構成だけ。
API を `app/api/**/route.ts` に置く構成（`examples/nextjs-route-handlers`）では使えないので、
その構成のサイトには入れない。

## セキュリティ運用（アプリの外側で入れるもの）

コードで塞げない部分は Cloudflare 側の設定で足す。どちらもパッケージの改修は要らない。

- **Cloudflare Access（Zero Trust）** を `/admin*` と `/api/admin/*` に被せる。
  メール OTP を1段前に置くだけで、パスワード漏れが単独では侵入にならなくなる。
  自動投稿（`automation`）を使っているサイトは Service Token を発行してその経路だけ通す
- **Rate Limiting Rules** を `/api/admin/*` に。アプリ側の試行回数制限はログインにしか無い
- **`GITHUB_TOKEN` の権限**は、記事を置くリポジトリだけに絞る。サイト本体のソースを
  書き換えられるトークンを管理画面に持たせると、管理画面を取られた時点でサイト全体を失う。
  期限付きトークンなら、残り30日を切った時点から公開後の応答に警告が出る

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
npm run check    # 型検査 → 公開前チェック → クラス名チェック → ビルド → テスト
npm test         # テストだけ流す
```

テストは `node:sqlite` で D1 を模して、`dist` のハンドラを Pages Functions と同じ形で呼ぶ
（配布されるものをそのまま試している）。migration を途中までしか流していない状態も再現できるので、
**列やテーブルが無いサイトで管理画面が止まらないこと**を確かめるのに使う。

`dist` はリポジトリにコミットする（git 依存でそのまま install できるようにするため）。
`src` を直したら `npm run build` して `dist` も一緒にコミットすること。CI がずれを検出する。

## ライセンス

MIT
