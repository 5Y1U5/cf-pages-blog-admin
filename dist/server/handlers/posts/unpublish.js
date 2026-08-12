import { postFilePath } from "../../../config/index.js";
import { json, nowIso, requireDb, requireUser } from "../../_shared/admin.js";
import { upsertGitHubFile } from "../../_shared/github.js";
import { CATEGORY_SELECT, draftToMarkdown, } from "../../_shared/posts.js";
export function createUnpublishHandlers(config) {
    const onRequestPost = async (ctx) => {
        const user = await requireUser(ctx.request, ctx.env, config, [
            "admin",
            "client_publisher",
        ]);
        if (user instanceof Response)
            return user;
        const db = requireDb(ctx.env);
        if (db instanceof Response)
            return db;
        const post = await db
            .prepare("SELECT * FROM post_drafts WHERE id = ? AND client_id = ? LIMIT 1")
            .bind(ctx.params.id, user.client_id)
            .first();
        if (!post)
            return json({ ok: false, error: "not_found" }, { status: 404 });
        const categories = await db
            .prepare(CATEGORY_SELECT)
            .bind(user.client_id)
            .all();
        // draft: true の frontmatter で上書きする（ファイルは残すが公開側の一覧から外れる）。
        const markdown = draftToMarkdown({ ...post, status: "draft" }, config, categories.results || []);
        const postCommit = await upsertGitHubFile(ctx.env, config, postFilePath(config, post.slug), markdown, `post: unpublish ${post.slug} from admin`);
        if (postCommit instanceof Response)
            return postCommit;
        const now = nowIso();
        await db
            .prepare(`UPDATE post_drafts
         SET status = 'draft',
             published_url = NULL,
             published_commit_sha = ?,
             updated_by = ?,
             updated_at = ?
         WHERE id = ? AND client_id = ?`)
            .bind(postCommit.commitSha, user.id, now, post.id, user.client_id)
            .run();
        return json({
            ok: true,
            status: "draft",
            commitSha: postCommit.commitSha,
        });
    };
    return { onRequestPost };
}
