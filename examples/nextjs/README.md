# Next.js（App Router）への組み込み例

`npx cf-pages-blog-admin init --framework nextjs` が生成するものと同じ内容。
実際の導入では `init` を使えばよく、このディレクトリは中身を確認するためのもの。

```
blog-admin.config.ts                     リポジトリ直下に置く
functions/api/admin/**                   再 export 16ファイル
src/app/admin/**/page.tsx                管理画面のページ
src/components/admin/router-adapter.tsx  next/link と useSearchParams を吸収する
```

`init` が作らないものが3つある。

1. `src/app/globals.css` の `@import "tailwindcss";` の直後に1行

   ```css
   @source "../../node_modules/@5y1u5/cf-pages-blog-admin/dist";
   ```

2. `wrangler.toml` のバインディング（`ADMIN_DB` / `ADMIN_ASSETS`）

3. `functions/tsconfig.json`

   ```json
   {
     "compilerOptions": {
       "target": "ES2022",
       "module": "ESNext",
       "moduleResolution": "Bundler",
       "lib": ["ES2022"],
       "types": ["@cloudflare/workers-types"],
       "strict": true,
       "skipLibCheck": true,
       "noEmit": true,
       "isolatedModules": true
     },
     "include": ["**/*.ts", "../blog-admin.config.ts"]
   }
   ```

   `npm run typecheck:functions`（`tsc --noEmit -p functions/tsconfig.json`）を CI に必ず入れる。
   設定項目の追加漏れはここでしか止められない。

## 補足

- `useSearchParams()` を使う画面（エディタ）は、静的書き出しのために `<Suspense>` 境界が要る。
  `src/app/admin/editor/page.tsx` がそうなっている
- コンパイル済みの `dist` を配っているので `transpilePackages` は不要
- 記事一覧のヘッダーに独自のボタンを足したい場合は `headerActions` を渡す

  ```tsx
  <AdminPostsClient
    config={blogAdminConfig}
    router={adminRouter}
    headerActions={<Link href="/admin/reports">レポート</Link>}
  />
  ```
