import type { BlogAdminConfig } from "../../config/index.js";
export interface PostDraftRow {
    id: string;
    client_id: string;
    /** 記事の区分。区分を使っていないサイトでは空文字。 */
    post_type?: string | null;
    slug: string;
    title: string;
    date: string;
    category_slug: string;
    category_label: string;
    excerpt: string;
    hero_image_key: string | null;
    hero_image_alt: string | null;
    author: string;
    author_role: string | null;
    body_markdown: string;
    og_description: string | null;
    tags_json: string;
    faq_json: string;
    status: string;
    source_path: string | null;
    source_hash: string | null;
    published_url: string | null;
    published_commit_sha: string | null;
    last_published_at: string | null;
    created_by: string;
    updated_by: string;
    created_at: string;
    updated_at: string;
}
export interface CategoryRow {
    id: string;
    client_id: string;
    code: string;
    slug: string;
    label: string;
    description: string | null;
    is_active: number;
    created_by: string;
    created_at: string;
    updated_at: string;
}
/** カテゴリ行を読み出す共通クエリ（列の並びを1か所に揃えるため）。 */
export declare const CATEGORY_SELECT = "SELECT id, client_id, code, slug, label, description, is_active,\n        created_by, created_at, updated_at\n FROM categories\n WHERE client_id = ?\n ORDER BY created_at ASC";
export declare function deriveExcerpt(body: string, max?: number): string;
export declare function draftToMarkdown(draft: PostDraftRow, config: BlogAdminConfig, categories?: CategoryRow[]): string;
/**
 * 公開済みの Markdown の frontmatter から `categoryLabel` の行だけを差し替える。
 *
 * カテゴリを改名したとき、公開中の記事は D1 の下書きから組み立て直せない
 * （まだ公開していない編集や `draft: true` まで一緒に書き出してしまうため）。
 * 表示名の1行だけを直して、いま出ている記事の中身はそのまま保つ。
 *
 * frontmatter が無い・`categoryLabel` の行が無い場合は null を返し、呼び出し側が飛ばす。
 */
export declare function replaceFrontmatterCategoryLabel(markdown: string, label: string): string | null;
export declare function categoryRowsToJson(rows: CategoryRow[]): string;
