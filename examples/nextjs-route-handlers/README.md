# Next.js（Route Handler）への組み込み例

`examples/nextjs` は Cloudflare Pages Functions（`functions/` ディレクトリ）を使う構成だが、
Next.js を Workers 上で動かしていて API も `app/api/**/route.ts` で書いている場合はこちらを使う。

違いは2点だけ。

1. サーバー側は `functions/` ではなく `app/api/admin/**/route.ts` に置き、
   `toRouteHandlers()` で Route Handler の export 形へ変換する
2. 公開ページが D1 を直接読む（SSR）構成なら `github.mode: "backup"` にする

画面（`AdminLoginClient` など）の組み込みは `examples/nextjs` と同じ。

## env の渡し方

Pages Functions では env が引数で渡ってくるが、Route Handler には渡ってこない。
実行環境ごとに取り方が違うため、パッケージ側では決め打ちせず導入側から渡す。

Workers 上の Next.js なら `cloudflare:workers` から取れる。

```ts
// app/api/admin/env.ts
import { env } from "cloudflare:workers";
import { mapEnv } from "@5y1u5/cf-pages-blog-admin/server/adapters/next";

// このパッケージは ADMIN_DB / ADMIN_ASSETS という名前でバインディングを探す。
// 既存サイトが別名で運用しているなら、ここで対応づける（バインディング自体は配り直さない）。
export const getBlogAdminEnv = () =>
  mapEnv(env as unknown as Record<string, unknown>, {
    ADMIN_DB: "DB",
    ADMIN_ASSETS: "BLOG_ASSETS",
  });
```

バインディング名が既定どおりなら `mapEnv` は要らず、`() => env` をそのまま渡してよい。

## ルート

```ts
// app/api/admin/posts/route.ts
import { createPostsHandlers } from "@5y1u5/cf-pages-blog-admin/server/handlers/posts/index";
import { toRouteHandlers } from "@5y1u5/cf-pages-blog-admin/server/adapters/next";

import { blogAdminConfig } from "../../../../blog-admin.config";
import { getBlogAdminEnv } from "../env";

export const { GET, POST } = toRouteHandlers(
  createPostsHandlers(blogAdminConfig),
  getBlogAdminEnv
);
```

動的セグメントも同じ。`[id]` は Route Handler の第2引数から取れるので、
アダプタがそのまま `ctx.params` へ渡す。

```ts
// app/api/admin/posts/[id]/route.ts
import { createPostDetailHandlers } from "@5y1u5/cf-pages-blog-admin/server/handlers/posts/detail";
import { toRouteHandlers } from "@5y1u5/cf-pages-blog-admin/server/adapters/next";

import { blogAdminConfig } from "../../../../../blog-admin.config";
import { getBlogAdminEnv } from "../../env";

export const { GET, PUT, DELETE } = toRouteHandlers(
  createPostDetailHandlers(blogAdminConfig),
  getBlogAdminEnv
);
```

置くファイルは `functions/` 版と1対1で対応する。

| Pages Functions | Route Handler |
|---|---|
| `functions/api/admin/me.ts` | `app/api/admin/me/route.ts` |
| `functions/api/admin/posts/index.ts` | `app/api/admin/posts/route.ts` |
| `functions/api/admin/posts/[id].ts` | `app/api/admin/posts/[id]/route.ts` |
| `functions/api/admin/posts/[id]/publish.ts` | `app/api/admin/posts/[id]/publish/route.ts` |
| `functions/api/admin/assets/public/[key].ts` | `app/api/admin/assets/public/[key]/route.ts` |

`functions/api/admin/posts.ts` のような「index への再 export」は Route Handler では不要。
ディレクトリ構造がそのままルートになるため。

## github.mode

公開ページが D1 を直接読む構成では、GitHub へのコミットは控えでしかない。
既定のまま（`"source"`）にすると、GitHub が一時的に落ちただけで公開できなくなる。

```ts
github: {
  owner: "...",
  repo: "...",
  mode: "backup",
},
```

`"backup"` では、コミットに失敗しても公開・取り下げ・削除は成立し、
応答の `warning` を編集画面が表示する。

## Tailwind

`@source` の指定は他の構成と同じ。CSS の場所に合わせて相対パスを変える。

```css
/* app/globals.css */
@import "tailwindcss";
@source "../node_modules/@5y1u5/cf-pages-blog-admin/dist";
```

## 型検査

`tsconfig.json` に `app/api/**` が含まれていれば、設定の追加漏れはそこで検出される。
Pages Functions 版のように別 tsconfig を足す必要はない。
