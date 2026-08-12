# 変更履歴

semver に従う。major に倒す条件は README の「バージョニング」を参照。

## 1.0.0

初版。既存実装からの統合方針は `docs/merge-decisions.md` を参照。

- Pages Functions のハンドラ16ルート分（設定を渡すファクトリ形式）
- 管理画面 UI（ログイン / 記事一覧 / エディタ / ユーザー管理 / ログアウト）
- リッチテキストエディタと Markdown 相互変換
- 画像アップロードの前処理（ブラウザ側リサイズ、非対応形式の事前判定）
- D1 の migration 2本と、新規導入用のテンプレート1本
- `init` / `sync-migrations` / `check-migrations` の CLI
