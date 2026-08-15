import { postFilePath, type BlogAdminConfig } from "../../../config/index.js";
import type { BlogAdminEnv } from "../../../config/env.js";
import { json, nowIso, requireDb, requireUser } from "../../_shared/admin.js";
import { recordAudit } from "../../_shared/audit.js";
import { describeCommitFailure, upsertGitHubFile } from "../../_shared/github.js";
import {
  CATEGORY_SELECT,
  draftToMarkdown,
  type CategoryRow,
  type PostDraftRow,
} from "../../_shared/posts.js";

export function createUnpublishHandlers(config: BlogAdminConfig) {
  const onRequestPost: PagesFunction<BlogAdminEnv> = async (ctx) => {
    const user = await requireUser(ctx.request, ctx.env, config, [
      "admin",
      "client_publisher",
    ]);
    if (user instanceof Response) return user;
    const db = requireDb(ctx.env);
    if (db instanceof Response) return db;

    const post = await db
      .prepare("SELECT * FROM post_drafts WHERE id = ? AND client_id = ? LIMIT 1")
      .bind(ctx.params.id, user.client_id)
      .first<PostDraftRow>();

    if (!post) return json({ ok: false, error: "not_found" }, { status: 404 });

    const categories = await db
      .prepare(CATEGORY_SELECT)
      .bind(user.client_id)
      .all<CategoryRow>();

    // draft: true の frontmatter で上書きする（ファイルは残すが公開側の一覧から外れる）。
    const markdown = draftToMarkdown(
      { ...post, status: "draft" },
      config,
      categories.results || []
    );
    const postCommit = await upsertGitHubFile(
      ctx.env,
      config,
      postFilePath(config, post.slug),
      markdown,
      `post: unpublish ${post.slug} from admin`
    );
    // github.mode: "backup" のサイトは公開ページが D1 を直接読むため、
    // コミットに失敗しても取り下げ自体は成立させる（警告だけ返す）。
    let warning: string | null = null;
    if (postCommit instanceof Response) {
      if (config.github.mode !== "backup") return postCommit;
      warning = await describeCommitFailure(postCommit);
    }

    const commitSha = postCommit instanceof Response ? null : postCommit.commitSha;
    const now = nowIso();
    await db
      .prepare(
        `UPDATE post_drafts
         SET status = 'draft',
             published_url = NULL,
             published_commit_sha = ?,
             updated_by = ?,
             updated_at = ?
         WHERE id = ? AND client_id = ?`
      )
      .bind(commitSha, user.id, now, post.id, user.client_id)
      .run();

    await recordAudit(db, ctx.request, user, {
      action: "post.unpublish",
      targetType: "post",
      targetId: post.id,
      summary: post.title,
    });

    return json({
      ok: true,
      status: "draft",
      commitSha,
      ...(warning ? { warning } : {}),
    });
  };

  return { onRequestPost };
}
