# Vite + wouter への組み込み例

`functions/` 以下は Next.js の場合とまったく同じ（`examples/nextjs/functions` を参照）。
Pages Functions はフロントの構成に依存しない。

違うのは3点だけ。

1. ルーターアダプタが wouter 版になる（`router-adapter.tsx`）
2. ページではなくルート定義に組み込む（`routes.tsx`）
3. `@source` を書く CSS が `client/src/index.css` になる

```css
@import "tailwindcss";
@source "../../node_modules/@5y1u5/cf-pages-blog-admin/dist";
```

## ローカルで管理画面を触る

`vite dev` は `functions/` を配信しないため、管理画面の API は動かない。
ビルドしてから Pages の開発サーバーに載せる。

```json
"dev:admin": "npm run build && wrangler@4 pages dev dist/public"
```

## 型検査

`functions/tsconfig.json` を新設し、`typecheck:functions` を CI に足す
（`examples/nextjs/README.md` の3を参照）。
