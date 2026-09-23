// 編集画面で記事を公開ページに近い見た目で描くための CSS。
// プレビュー表示と、見たまま編集の中の装飾枠（ArticleBlock）の両方で使う。
// クラスはすべて .admin-article-preview の内側に閉じてあり、管理画面の他の部分には効かない。
export const PREVIEW_ARTICLE_CSS = `
.admin-article-preview .admin-markdown-preview > *:first-child { margin-top: 0; }
.admin-article-preview .admin-markdown-preview > *:last-child { margin-bottom: 0; }
.admin-article-preview h1 { margin: 0 0 18px; font-size: 24px; line-height: 1.35; font-weight: 800; }
.admin-article-preview h2 { margin: 30px 0 14px; padding-left: 12px; border-left: 4px solid #0f172a; font-size: 22px; line-height: 1.45; font-weight: 800; }
.admin-article-preview h3 { margin: 24px 0 10px; font-size: 18px; line-height: 1.55; font-weight: 800; }
.admin-article-preview p { margin: 0 0 16px; line-height: 2; }
.admin-article-preview ul, .admin-article-preview ol { margin: 0 0 18px; padding-left: 1.5em; line-height: 1.9; }
.admin-article-preview li + li { margin-top: 6px; }
.admin-article-preview img { width: 100%; border-radius: 12px; object-fit: cover; }
.admin-article-preview table { width: 100%; margin: 20px 0 24px; border-collapse: collapse; font-size: 14px; }
.admin-article-preview th, .admin-article-preview td { padding: 12px 14px; text-align: left; border: 1px solid #dde3ec; vertical-align: top; }
.admin-article-preview th { background: #f2f6fb; color: #082f60; font-weight: 800; }
.admin-article-preview blockquote { margin: 22px 0; padding: 16px 18px; border-left: 4px solid #38bdf8; border-radius: 10px; background: #f4f8fb; color: #334155; }
.admin-article-preview .blog-callout { display: flex; align-items: flex-start; gap: 14px; margin: 26px 0; padding: 18px 20px; background: #f4f8fb; border-left: 4px solid #38bdf8; border-radius: 12px; }
.admin-article-preview .blog-callout-icon { display: flex; flex: 0 0 auto; align-items: center; justify-content: center; width: 34px; height: 34px; border-radius: 9px; background: rgba(56, 189, 248, .16); color: #075985; }
.admin-article-preview .blog-callout-icon svg { width: 18px; height: 18px; }
.admin-article-preview .blog-callout-text { flex: 1; font-size: 14px; line-height: 1.9; }
.admin-article-preview .blog-callout-text strong { display: block; margin-bottom: 4px; color: #0f172a; }
.admin-article-preview .blog-points, .admin-article-preview .blog-compare { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; margin: 26px 0; }
.admin-article-preview .blog-point { padding: 16px 18px; border: 1px solid #dfe6ee; border-radius: 12px; background: #fff; }
.admin-article-preview .blog-point-label { display: block; margin-bottom: 6px; color: #0369a1; font-size: 11px; font-weight: 800; letter-spacing: .12em; }
.admin-article-preview .blog-point-text { margin: 0; font-size: 14px; line-height: 1.8; }
.admin-article-preview .blog-compare-card { padding: 16px 18px; border-radius: 12px; background: #f5f6f8; }
.admin-article-preview .blog-compare-card.is-after { background: rgba(56, 189, 248, .1); border: 1px solid rgba(56, 189, 248, .35); }
.admin-article-preview .blog-compare-label { margin-bottom: 6px; font-size: 11px; font-weight: 800; letter-spacing: .12em; color: #64748b; }
.admin-article-preview .blog-compare-card.is-after .blog-compare-label { color: #0369a1; }
.admin-article-preview .blog-compare-text { font-size: 14px; line-height: 1.8; }
.admin-article-preview .blog-stat { margin: 26px 0; padding: 26px 16px; border-radius: 16px; background: #f4f8fb; text-align: center; }
.admin-article-preview .blog-stat-number { display: block; margin-bottom: 6px; color: #0f172a; font-size: 38px; font-weight: 800; line-height: 1.1; }
.admin-article-preview .blog-stat-text { font-size: 13px; color: #64748b; }
.admin-article-preview .blog-faq { margin-top: 38px; padding-top: 28px; border-top: 1px solid #dfe6ee; }
.admin-article-preview .blog-faq h2 { margin: 0 0 18px; }
.admin-article-preview .blog-faq details { margin-bottom: 12px; padding: 16px 20px; border: 1px solid #dfe6ee; border-radius: 12px; }
.admin-article-preview .blog-faq details[open] { border-color: #38bdf8; }
.admin-article-preview .blog-faq summary { cursor: pointer; font-size: 14px; font-weight: 800; }
.admin-article-preview .blog-faq details div { margin-top: 10px; font-size: 14px; line-height: 1.9; color: #475569; }
.admin-article-block { margin: 18px 0; border-radius: 12px; cursor: default; }
.admin-article-block > div > * { margin-top: 0; margin-bottom: 0; }
.admin-article-block.ProseMirror-selectednode { outline: 2px solid #38bdf8; outline-offset: 4px; }
.admin-article-preview .admin-article-block-note { margin: 6px 0 0; font-size: 11px; line-height: 1.6; color: #94a3b8; }
.tiptap .admin-article-block p { margin-top: 0; margin-bottom: 0; line-height: 1.8; }
.tiptap .admin-article-block .admin-article-block-note { margin-top: 6px; }
@media (max-width: 640px) { .admin-article-preview .blog-points, .admin-article-preview .blog-compare { grid-template-columns: 1fr; } }
`;
