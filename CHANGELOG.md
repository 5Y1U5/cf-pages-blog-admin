# 変更履歴

semver に従う。major に倒す条件は README の「バージョニング」を参照。

## 4.0.0

既存の記事の slug（URL の末尾）を管理画面から変えられるようにした。これまでは最初の保存で
欄が固定され、変えるには D1 を直接書き換えるしかなかった。

migration が1本増え、画面の挙動も変わるため major にした（バージョニング基準 2・4）。
**major は自動マージされない。** 導入先では次の3つを人が入れる。

1. `npx cf-pages-blog-admin sync-migrations` → `npx wrangler d1 migrations apply <db> --remote`
   （`0008_post_redirects.sql`。**デプロイの前に**流す。無くても slug の変更自体は通るが、転送が効かず、
   保存のたびに警告が出る）
2. 記事の公開接頭辞の下に `functions/<接頭辞>/_middleware.ts` を1枚置く（README「slug の変更と旧 URL からの転送」）。
   Worker のサイトは `resolvePostRedirect` を fetch の先頭で呼ぶ
3. `package.json` のこのパッケージを `#v4.0.0` へ上げる

2.x から上げるサイトは 3.0.0 の手順（`sync-routes` とカテゴリ画面）も一緒に入れる。

- `PUT /api/admin/posts/<id>` が `slug` を受け付ける。省略・空・同じ値は変えない。
  形式が違う／同じサイトの別の記事と重複 → 400。既存の自動投稿は `slug` を送らないので挙動は変わらない
- 公開したことのある記事の slug を変えると、GitHub の Markdown を新しいパスへ移し（1コミットで追加＋削除）、
  `published_url` を追随させ、旧 URL を `post_redirects` に残す。
  `github.mode: "source"` で GitHub に書けなければ何も変えずに 500、`"backup"` は進めて `warning`
- `PUT` の応答が `{ ok, slug, publishedUrl, warning? }` になった（従来は `{ ok }` だけ）
- 公開側の部品 `server/public/slug-redirect` を追加。`createSlugRedirectMiddleware(config)`（Pages Functions の
  `_middleware`）と `resolvePostRedirect(db, config, pathname)`。転送先は記事のいまの `published_url`。
  公開を取り下げた記事・未公開の記事へは送らない
- 記事の削除で `post_redirects` も消す
- 編集画面: 保存済みの記事でも slug 欄を編集できる。公開済みの記事で値を変えると
  「保存すると URL が変わります」と出す。保存の応答の `warning` をメッセージに出す
- 操作ログに `post.rename`（旧 → 新）を追加
- `_shared/github` の `commitGitHubFiles` が削除に対応した（`content: null`）。
  `_shared/posts` に `replaceFrontmatterField` を追加（`replaceFrontmatterCategoryLabel` はその薄い皮になった）
- migration `0008_post_redirects.sql` を追加

## 3.1.3

- tiptap を 3.31.3 へ上げた。`@tiptap/core` の `mergeAttributes()` が `__proto__` を DOM 属性として
  扱い、`onerror` などの実行可能な属性が継承されうる不具合（3.30.4 で修正）を塞ぐため。
  管理画面のエディタの見た目・貼り付け・ツールバー・元に戻すはブラウザで動作を確認済み

## 3.1.2

- 編集画面のプレビューが本文中の生 HTML をそのまま描いていたのをやめた。marked の出力を
  `dangerouslySetInnerHTML` へ渡していたため、本文に `<img src=x onerror=...>` が入っていると
  記事を開いた管理者のセッションでスクリプトが動いた（本文は自動投稿でも入る）。
  公開側の `remark-html`（`sanitize: true`）と同じく生 HTML を落とし、リンクと画像からは
  `javascript:` / `data:` など http(s)・mailto・tel 以外のスキームを外す
- カテゴリ改名の書き戻し対象に「公開中の記事を開いて保存したもの」を加えた。
  保存すると `status` は `draft` に戻るがサイトには出たままで、3.1.0 の書き戻し
  （`status = 'published'` のみ）から漏れて古い名前が残っていた。
  この記事は組み立て直さず、いまのファイルの `categoryLabel` の行だけ差し替える
- `PATCH /api/admin/categories/<id>` の応答に `skippedPosts`（公開中だが書き戻せなかった記事）が増えた。
  カテゴリ画面のメッセージにも出る
- `_shared/github` に `readGitHubFile`、`_shared/posts` に `replaceFrontmatterCategoryLabel` を追加
- 公開に失敗したときの状態の戻し先を、公開処理を始める前の状態に直した。
  公開済みの記事を公開し直して失敗すると `approved`（承認済み）へ落ちていたが、
  記事はサイトに出たままなので一覧の表示が実態とずれていた。`publishing` のときだけ `approved` に倒す
- 新規記事の slug で、画面がタイトルから自動入力した値にも 1.2.1 の判定（英字を含み3文字以上）を
  かけるようにした。画面はその値を明示指定として送るためサーバー側の判定を素通りしており、
  タイトル「3つのコツ」で slug が `3`（公開 URL は `/post/3`）になっていた。
  利用者が手で入れた slug はこれまでどおり尊重する
- 公開の取り下げは Markdown を消さず `draft: true` で上書きする。README・3.1.0 の記述にあった
  「取り下げ済みにはファイルが無い」を実装に合わせて直した。
  なお取り下げたあとに記事を削除すると、GitHub 上のファイル（`draft: true`）は残る

## 3.1.0

3.0.0 の積み残しを埋めた。**3.0.0 は飛ばして 3.1.0 を入れること。**

3.0.0 の改名は D1 と `blog-categories.json` しか直しておらず、公開済み記事の Markdown に
焼き込んだ `categoryLabel` が古い名前のまま残っていた。導入側のサイトは frontmatter を
優先して読むため、一覧のタブは新しい名前・記事カードと記事ページは古い名前、という
食い違いが出ていた。

- 改名時に、そのカテゴリの公開済み記事（`status = 'published'`）の Markdown も
  組み立て直して書き戻す。組み立ては公開処理と同じ `draftToMarkdown` を通す。
  下書きは対象外（そもそもファイルが無い）
  （注: 「取り下げ済みも対象外＝ファイルが無い」と書いていたが、取り下げはファイルを消さない。
  Unreleased で訂正）
- 書き戻しは Git Data API で**1コミットにまとめる**。記事を1本ずつコミットすると、
  途中で失敗したときに「3本だけ新しい名前」という状態が残り、戻す作業もまた失敗しうる。
  1コミットなら結果は「全部書けた」か「1つも書けていない」のどちらかにしかならない。
  GitHub への呼び出しは記事数によらず5回
- 失敗したときは D1 の改名も元へ戻す。そのまま同じ操作をやり直せる
- `_shared/github` に `commitGitHubFiles` を追加
- `PATCH /api/admin/categories/<id>` の応答に `republishedPosts`（書き戻した記事数）が増えた

## 3.0.0

カテゴリを管理画面から追加・改名できるようにした。これまで D1 のカテゴリを足したり名前を
変えたりする手段が無く、リポジトリの `blog-categories.json` を直接編集しても、次に記事を
公開した時点で D1 の内容に上書きされて元に戻っていた。

記事一覧のヘッダーにボタンが1つ増えるため major にした（バージョニング基準4）。
**major は自動マージされない。** 導入先では次の3つを人が入れる。
2 を入れる前に配ると、増えたボタンを押したときだけ 404 になる。

**migration は増えていない。**（Renovate の更新 PR では 1・2 を配れない）

1. `npx cf-pages-blog-admin sync-routes` を流して
   `functions/api/admin/categories/[id].ts` に `onRequestPatch` を足す。
   忘れると画面から名前を変えたときだけ 405 になる
2. `/admin/categories` のページを1枚足す（Next.js は `src/app/admin/categories/page.tsx`、
   Vite + wouter はルーター定義に 1 行。`examples/` に実例がある）
3. `package.json` のこのパッケージを `#v3.0.0` へ上げる

- `PATCH /api/admin/categories/<id>` を追加。`label` と `description` を変更できる。
  権限は追加（POST）と同じ `admin` / `client_publisher`
- **`slug` と `code` は変更できない。** 記事は `category_slug` で紐づき、書き出した Markdown の
  frontmatter も `code` を持つため、変えると既存記事との対応が切れる。送ると 400 で断る
- 表示名を変えると、そのカテゴリの記事（`post_drafts.category_label`）も同じ名前へ追随する。
  すでに公開した Markdown の `categoryLabel` は書き換わらず、その記事を次に公開したときに変わる
- 追加・変更・削除のたびに `content.categoriesJsonPath` の JSON を GitHub へ書き戻す。
  **追加も書き戻すようになった**（従来は記事を公開するまで書かれず、追加したカテゴリが
  画面にはあるのにサイトには無い状態が続いた）。
  書き出しに失敗したら D1 の変更も元へ戻す（ずれたまま残すと次の公開で古い名前へ戻るため）
- `ui` に `AdminCategoriesClient` を追加。記事一覧のヘッダー（管理者のみ）から開ける。
  一覧・追加・名前の変更・削除ができる。並べ替えは無い
- 操作ログに `category.update` を追加
- `toRouteHandlers`（Route Handler アダプタ）が PATCH に対応した

## 2.0.0

セキュリティ面の積み残しを埋めた。**migration が2本増えるので、
導入先の本番 D1 へ先に適用してからデプロイすること**（列が無い状態で新しいコードが届いても
管理画面は動くが、変更の促しと操作ログが無効のままになる）。

- 本人によるパスワード変更を追加。`PUT /api/admin/users/me` に `currentPassword` と
  `newPassword` を送る。権限は問わない。変更すると自分の他のセッションだけ失効する
- 新規ユーザー作成・パスワード再発行で `users.must_change_password` が立ち、
  変更するまで**サーバーがパスワード変更と `GET /api/admin/me` 以外を 403 で止める**。
  管理画面はどの画面を開いても変更フォームを出す（変更するまで閉じられない）
- 操作ログ `audit_logs` を追加。ログイン／ログアウト／パスワード変更／記事の作成・公開・取り下げ・
  削除／ユーザーの追加・変更・削除・再発行／カテゴリの追加・削除／画像アップロードを記録し、
  ユーザー管理画面に直近 50 件を出す。記録に失敗しても本処理は止めない
- 公開時、`GITHUB_TOKEN` の残り有効期限が 30 日以下なら応答の `warning` で知らせる
  （無期限のトークンでは何も出ない）
- `cf-pages-blog-admin sync-routes` / `check-routes` を追加。導入先の再 export が
  パッケージのルート定義から遅れていないかを CI で検出できる
- migration `0006_must_change_password.sql` / `0007_audit_logs.sql` を追加
- `ui` に `AdminPasswordPanel` を追加

## 1.4.0

1つのサイトで「お知らせ」と「ブログ」のように出し先が分かれる構成に対応した。
既存の導入先に必要な作業は migration の適用だけで、設定を足さなければ挙動は変わらない。

- `content.postTypes` を追加（既定は空 = 区分なし）。指定すると編集画面に区分の選択が出て、
  公開 URL は区分ごとの `publicPathPrefix` になる
- migration `0005_post_type.sql` を追加。`post_drafts.post_type` 列と索引を足す。
  区分を使わないサイトでは常に空文字のまま
- 記事一覧・保存・公開が `post_type` を持ち回るようになった。
  更新時に区分の指定が無ければ既存の値を保つ

## 1.3.1

- `ArticleBody` が Markdown 部分を `div` で包んでいたのをやめた。導入先の記事 CSS が
  `.article-body > * + *` のような直下セレクタで段落の余白を作っているため、
  包むと段落どうしの余白が消えていた

## 1.3.0

- `ArticleBody` を `ui` に追加。react-markdown で本文を描いているサイト向けに、
  ブロック記法の部分だけをパッケージが組み立て、残りは導入側の描画へ渡す。
  ブロックの HTML はパッケージ内でエスケープ済みのものだけを流す

## 1.2.1

- 日本語タイトルに数字や英字が1文字でも混ざっていると、そこだけを取り出した slug
  （「3つのコツ」→ `3`）が付いてしまうのを直した。英字を含み3文字以上のものだけ採用し、
  それ以外は従来の自動採番（`post-<日付>-<乱数>`）へ回す。
  明示指定された slug の扱いは変わらない

## 1.2.0

写真を使わない記事でも読み進められるよう、本文に差し込む視覚要素をブロック記法で
書けるようにした。既存の導入先に必要な作業は無い（記法を使わなければ何も変わらない）。

- `content/article-blocks` を追加。`:::callout` / `:::points` / `:::compare` /
  `:::stat` / `:::faq` の5種類を Markdown から書ける。
  中身は必ずエスケープしてから組み立てるので、公開側のサニタイズを外さずに済む
  （リンクは http/https のみ、強調は `**...**` のみ通す）
- Markdown 本体の変換は導入側から関数で渡す（公開側は remark、編集画面は marked と
  ライブラリが違うため）。`renderArticleHtml` と非同期版を用意
- 閉じ忘れたブロックは Markdown としてそのまま出す（記事が消えるより崩れて見えるほうがよい）
- 編集画面のプレビューは、ブロックを「要点ボックス」等のラベルで簡易表示する。
  実際の見た目は公開ページの CSS が決める

対応する CSS のひな形は `docs/article-blocks.css` にある。導入先の配色に合わせて調整する。

## 1.1.0

Next.js の Route Handler で動くサイト（公開ページが D1 を直接読む SSR 構成）を
載せられるようにした。既存の導入先に必要な作業は無い。追加した設定はすべて任意で、
既定値は従来の挙動と同じ。

- `server/adapters/next` を追加。Pages Functions 形式のハンドラを Route Handler の
  export 形（`GET` / `POST` / `PUT` / `DELETE`）へ変換する。
  env の取り方は実行環境ごとに違うため、導入側が関数で渡す。
  バインディング名が既定（`ADMIN_DB` / `ADMIN_ASSETS`）と違うサイト向けに `mapEnv()` も入れた
- `github.mode` を追加（既定 `"source"`）。`"backup"` にすると、公開・取り下げ・削除の
  GitHub コミットに失敗しても処理そのものは成立し、応答に `warning` が入る。
  公開ページが D1 を直接読む構成では、コミットは控えでしかないため。
  `"source"` はこれまでどおり、コミットに失敗したら状態を戻して公開しない
- 編集画面が `warning` を表示するようにした（成功の文言に続けて理由を出す）
- `automation` を追加（既定 `tokenEnvVar: null` で無効）。ブラウザを介さない書き込みを
  `Authorization: Bearer <token>` で通す。記事生成を自動化していて外部プログラムが
  管理画面と同じ API を叩くサイト向け。トークンは32文字以上、比較は時間差が出ない形にしてある
- `examples/nextjs-route-handlers` を追加

## 1.0.3

- `examples/vite-wouter` の `Link` の import 元が誤っていたのを直した（example のみの修正）

## 1.0.2

既存サイトの載せ替え検証で見つかった 1.0.1 の不具合修正。設定・API・migration の
変更は無いため、導入側は依存の参照先を `#v1.0.2` に変えるだけでよい。

- 新規記事のカテゴリ初期選択が、設定を見ずに登録順の先頭を選んでいたのを直した。
  `category.preferredSlugs` → `category.defaultSlug` → 登録順の先頭、の順で探す。
  ほぼ毎日「お知らせ」を出しているサイトで、初期選択が別カテゴリになり、
  そのまま公開される事故を防ぐ。判定は `resolveDefaultCategory()` に集約し、
  公開時のサーバー側の自動補完も同じ関数を使う（画面と結果が食い違わない）
- あわせて、既存記事を開いたときにカテゴリ取得の応答が後着すると、その記事のカテゴリを
  既定値で上書きしていたのを直した（記事の読み込みと並行して走るため起きていた）
- `publish.requiredFields` に `slug` を含むサイトで、日本語タイトルの新規記事の
  公開ボタンが押せなかったのを直した。slug は保存時にサーバーが必ず採番するので、
  画面側の未入力判定からは除外する（`SERVER_ASSIGNED_FIELDS`）。
  サーバー側の検証は従来どおり残っており、未保存の新規記事でも公開ボタンが押せて、
  押すと保存してから公開が走る
- `publish.publicPathPrefix` の説明を README に追加した。記事 URL が `/blog` 以外の
  サイトで既定のままだと、記事削除の確認ダイアログに存在しない URL が出る

## 1.0.1

パイロット導入で見つかった 1.0.0 の不具合修正。設定・API・migration の変更は無いため、
導入側は依存の参照先を `#v1.0.1` に変えるだけでよい。

- 閲覧専用（`client_viewer`）の読み取り専用 UI を戻した。`AdminEditorClient` と
  `AdminPostsClient` で保存・公開・公開取り下げ・画像アップロード・カテゴリ追加を無効化し、
  記事一覧の「新規記事」を出さない。閲覧専用でログインしている旨の告知帯も出す
- あわせて、閲覧専用ではエディタの入力欄も読み取り専用にした（保存できない変更を
  書けてしまい、離脱時に黙って消えるため）。`RichTextEditor` に任意の `editable` を追加
- 上記の操作がサーバーで 403 になったとき、「必須項目を確認してください」ではなく
  権限の問題だと分かる文言を出すようにした
- 公開後に画面が持つ公開 URL を、クライアントの `slug` から組み立てるのをやめ、
  サーバーが返す `publishedUrl` を優先するようにした。新規記事で slug がサーバー側で
  連番化された場合に、実際の公開先とずれていた
- カテゴリ作成が既存 slug と競合したとき、レスポンスが新規採番した id を返していたのを、
  `RETURNING` で DB に入っている行の id を返すようにした。追加直後の削除が効かなかった
- `AdminPostsClient` の見出しラベルを `brandLabel` 設定に合わせた（`"BLOG ADMIN"` 固定だった）

## 1.0.0

初版。既存実装からの統合方針は `docs/merge-decisions.md` を参照。

- Pages Functions のハンドラ16ルート分（設定を渡すファクトリ形式）
- 管理画面 UI（ログイン / 記事一覧 / エディタ / ユーザー管理 / ログアウト）
- リッチテキストエディタと Markdown 相互変換
- 画像アップロードの前処理（ブラウザ側リサイズ、非対応形式の事前判定）
- D1 の migration 2本と、新規導入用のテンプレート1本
- `init` / `sync-migrations` / `check-migrations` の CLI
