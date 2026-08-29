# カテゴリを画面から管理できるようにする（2026-08-29 起票）

## そのまま投げるプロンプト

```
cf-pages-blog-admin に、ブログのカテゴリを管理画面から追加・改名できる機能を入れてください。

■ なぜ必要か（実際に起きた事故）

サンコー産業（sanko-corporate）で 2026-08-27 に次のことが起きました。

1. カテゴリを4分割（スタッフブログ／住まいのコラム／カラー講座／お知らせ）する変更を、
   リポジトリの content/blog-categories.json を直接編集して commit した（54dc856）
2. その後クライアントが管理画面から記事を1本公開した
3. publish ハンドラが D1 の categories を書き出して blog-categories.json を上書きし、
   4分割が消えて「ブログ」「お知らせ」の2つに戻った（0bff2c9 / 3a16937）

D1 が正本なので上書き自体は設計どおりです。問題は、D1 側のカテゴリを
足したり名前を変えたりする手段が存在しないことです。

■ 現状の不足（確認済み）

・src/server/handlers/categories/index.ts … GET（一覧）と POST（追加）のみ
・src/server/handlers/categories/detail.ts … DELETE のみ。しかも記事が1本でも
  使っていると 400 で拒否される
・つまり「使用中カテゴリの改名」は API 経路が無く不可能
・src/ui/ に categories API を呼ぶ画面が1つも無い（grep で0件）。
  管理画面からはカテゴリの追加も改名もできない

■ やってほしいこと

1. カテゴリの更新 API を追加する
   ・detail.ts に onRequestPatch（label / description の更新）を足す
   ・slug と code は変更させない。記事の category_slug と JSON の参照が壊れるため
   ・label を更新したら、posts / post_drafts の category_label も同じ client_id の
     範囲で追随させる（表示名がテーブル間でずれると一覧と記事ページで食い違う）
   ・更新後に blog-categories.json を GitHub へ書き戻す。detail.ts の DELETE が
     すでに upsertGitHubFile でやっているので同じ経路に乗せる
   ・recordAudit を既存と同じ粒度で残す
   ・権限は既存の DELETE（admin）と POST（admin / client_publisher）を見て揃える

2. 管理画面にカテゴリ管理を足す
   ・一覧、追加、名前の変更ができれば十分。並べ替えは不要
   ・削除は既存 API のとおり、使用中なら拒否されるメッセージをそのまま出す
   ・日本語UI。既存の AdminPostsClient.tsx / AdminUsersClient.tsx の書き方に揃える

3. テストを足す
   ・改名したときに posts / post_drafts の category_label が追随すること
   ・slug は変更できないこと
   ・使用中カテゴリを削除できないこと（既存挙動の回帰）

4. リリース
   ・CHANGELOG.md に追記し、v2.1.0 としてタグを打つ
   ・導入側は github:5Y1U5/cf-pages-blog-admin#v2.0.0 で固定しているため、
     載せ替えは各サイト側で package.json を上げる必要がある。ここでは行わない

■ やらないこと

・slug / code の変更機能（URL とデータ整合が壊れる）
・publish 時の書き戻しをやめること（D1 正本の設計は維持する）
・サンコー産業のデータそのものの修正（別作業）
```

## この修正のあとに残る作業（サンコー産業側）

パッケージを直しただけではサンコーのカテゴリは戻らない。データの作業が別途必要。

1. sanko-corporate の package.json を v2.1.0 へ上げてデプロイ
2. 管理画面から `column` = 暮らしのコラム、`staff` = スタッフブログ、
   `color` = カラー講座 を追加（顧客が 2026-08-28 に4分割と「暮らしのコラム」を承諾済み）
3. 未公開の下書き3本は保留のまま。顧客がミーティングで相談したいと言っている
