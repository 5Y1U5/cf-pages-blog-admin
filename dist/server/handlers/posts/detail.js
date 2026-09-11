import { normalizePostType, postFilePath, publicPostUrl, } from "../../../config/index.js";
import { badRequest, isValidSlug, json, normalizeString, nowIso, randomId, readJson, requireDb, requireUser, } from "../../_shared/admin.js";
import { recordAudit } from "../../_shared/audit.js";
import { commitGitHubFiles, deleteGitHubFile, describeCommitFailure, readGitHubFile, } from "../../_shared/github.js";
import { deriveExcerpt, replaceFrontmatterField, } from "../../_shared/posts.js";
const EDITABLE_STATUSES = ["draft", "review", "approved", "archived"];
/**
 * GitHub 上に記事の Markdown があるか。削除・slug 変更のときにファイルへ触るかの判定。
 * 未公開の下書きにはファイルが無い。
 */
function hasGitHubFile(post) {
    return (post.status === "published" ||
        post.status === "publishing" ||
        Boolean(post.published_url) ||
        Boolean(post.source_path));
}
/**
 * slug を変えたとき、GitHub の Markdown を新しいパスへ移す（1コミットで「新パス追加＋旧パス削除」）。
 *
 * 静的サイト（github.mode: "source"）は content/posts/<slug>.md の並びで記事ページを作るため、
 * ファイルを動かさないと新 URL のページができない。旧ファイルを残すと旧 URL と新 URL の両方で
 * 同じ記事が出る。中身は「いまサイトに出ている現物」を読んで frontmatter の slug 行だけ差し替える
 * （D1 の下書きから組み立て直すと、まだ公開していない編集まで出てしまう）。
 * 旧ファイルが無ければ何もしない。
 */
async function moveGitHubPost(env, config, fromPath, toPath, fromSlug, toSlug) {
    if (fromPath === toPath)
        return { ok: true, moved: false, tokenWarning: null };
    const current = await readGitHubFile(env, config, fromPath);
    if (current instanceof Response)
        return current;
    if ("missing" in current)
        return { ok: true, moved: false, tokenWarning: null };
    const content = replaceFrontmatterField(current.content, "slug", toSlug) ?? current.content;
    const commit = await commitGitHubFiles(env, config, [
        { path: toPath, content },
        { path: fromPath, content: null },
    ], `post: rename ${fromSlug} to ${toSlug} from admin`);
    if (commit instanceof Response)
        return commit;
    return { ok: true, moved: true, tokenWarning: commit.tokenWarning };
}
/**
 * 変更前の公開パスを転送表に残す。公開側の中間処理（server/public/slug-redirect）が
 * 旧 URL へ来た人を新 URL へ 301 で送るための記録。
 *
 * 新パスと同じ旧パスの行が残っていれば先に消す（別の記事が昔使っていた URL を今回の記事が
 * 引き取った形。転送を残すと新 URL が 301 で別の記事へ飛んでしまう）。
 *
 * 転送表が無いサイト（migration 0008 が未適用）では false を返し、保存そのものは止めない。
 */
async function recordRedirect(db, clientId, postId, fromPath, toPath) {
    try {
        await db
            .prepare("DELETE FROM post_redirects WHERE client_id = ? AND from_path = ?")
            .bind(clientId, toPath)
            .run();
        await db
            .prepare(`INSERT INTO post_redirects (id, client_id, post_id, from_path, created_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(client_id, from_path) DO UPDATE SET post_id = excluded.post_id, created_at = excluded.created_at`)
            .bind(randomId("redir"), clientId, postId, fromPath, nowIso())
            .run();
        return true;
    }
    catch {
        return false;
    }
}
function joinWarnings(...parts) {
    const filtered = parts.filter((part) => Boolean(part));
    return filtered.length ? filtered.join(" ") : null;
}
export function createPostDetailHandlers(config) {
    const onRequestGet = async (ctx) => {
        const user = await requireUser(ctx.request, ctx.env, config);
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
        return json({ ok: true, post });
    };
    const onRequestPut = async (ctx) => {
        const user = await requireUser(ctx.request, ctx.env, config, [
            "admin",
            "client_publisher",
        ]);
        if (user instanceof Response)
            return user;
        const db = requireDb(ctx.env);
        if (db instanceof Response)
            return db;
        const payload = await readJson(ctx.request);
        if (payload instanceof Response)
            return payload;
        // 下書き保存はタイトルだけ必須。カテゴリ・要約・本文は未入力でも保存できる（公開時に補完）。
        const title = normalizeString(payload.title);
        if (!title)
            return badRequest("タイトルを入力してください。");
        const categorySlug = normalizeString(payload.categorySlug);
        const categoryLabel = normalizeString(payload.categoryLabel);
        const bodyMarkdown = normalizeString(payload.bodyMarkdown);
        // 抜粋未入力なら本文から自動生成する。本文も空のまま保存できる仕様のため、
        // その場合は deriveExcerpt("") が空文字を返し既存の挙動を維持する。
        const excerpt = normalizeString(payload.excerpt) || deriveExcerpt(bodyMarkdown);
        const status = payload.status || "draft";
        if (!EDITABLE_STATUSES.includes(status)) {
            return badRequest("invalid status.");
        }
        // 更新前の行。区分の既定・slug 変更の判定・改訂履歴の3つに使う。
        const prior = await db
            .prepare("SELECT * FROM post_drafts WHERE id = ? AND client_id = ? LIMIT 1")
            .bind(ctx.params.id, user.client_id)
            .first();
        if (!prior)
            return json({ ok: false, error: "not_found" }, { status: 404 });
        // 区分は指定が無ければ既存の値を保つ。区分を使っていないサイトでは常に空文字。
        const postType = config.content.postTypes.length
            ? normalizePostType(config, payload.postType ?? prior.post_type ?? "")
            : "";
        // slug の変更。省略・空・同じ値は「変えない」。形式と、同じサイト内の他の記事との重複を見る。
        // 画面はタイトルから自動生成した値を送ってこない（既存記事では slug 欄の値をそのまま送る）ので、
        // 新規作成（posts/index.ts）にある「自動入力かどうか」の判定はここでは要らない。
        const requestedSlug = normalizeString(payload.slug);
        const slugChanged = Boolean(requestedSlug) && requestedSlug !== prior.slug;
        if (slugChanged) {
            if (!isValidSlug(requestedSlug)) {
                return badRequest("slug は半角の英数字とハイフンだけで入力してください。");
            }
            const taken = await db
                .prepare("SELECT 1 FROM post_drafts WHERE client_id = ? AND slug = ? AND id <> ? LIMIT 1")
                .bind(user.client_id, requestedSlug, prior.id)
                .first();
            if (taken)
                return badRequest("この slug は別の記事で使われています。");
        }
        const nextSlug = slugChanged ? requestedSlug : prior.slug;
        // 公開したことのある記事は公開 URL も追随させる（公開処理と同じ組み立て）。
        const nextPublishedUrl = slugChanged && prior.published_url
            ? publicPostUrl(config, nextSlug, postType)
            : prior.published_url;
        const priorFilePath = prior.source_path || postFilePath(config, prior.slug);
        const nextFilePath = postFilePath(config, nextSlug);
        const nextSourcePath = slugChanged && prior.source_path ? nextFilePath : prior.source_path;
        let warning = null;
        // GitHub の Markdown は D1 を書き換える前に動かす。ここで失敗したら何も変えずに返せる。
        // github.mode: "backup" のサイトは公開ページが D1 を直接読むので、控えを動かせなくても
        // 変更自体は進める（警告だけ返す）。
        if (slugChanged && hasGitHubFile(prior)) {
            const moved = await moveGitHubPost(ctx.env, config, priorFilePath, nextFilePath, prior.slug, nextSlug);
            if (moved instanceof Response) {
                if (config.github.mode !== "backup")
                    return moved;
                warning = await describeCommitFailure(moved);
            }
            else if (moved.tokenWarning) {
                warning = moved.tokenWarning;
            }
        }
        const now = nowIso();
        // 更新前の状態を改訂履歴として保存する（誰がいつ何を変えたかの監査証跡）。
        await db
            .prepare("INSERT INTO revisions (id, post_id, snapshot_json, changed_by, change_note, created_at) VALUES (?, ?, ?, ?, ?, ?)")
            .bind(randomId("rev"), String(ctx.params.id), JSON.stringify(prior), user.id, "update", now)
            .run();
        const result = await db
            .prepare(`UPDATE post_drafts SET
           post_type = ?,
           slug = ?,
           title = ?,
           date = ?,
           category_slug = ?,
           category_label = ?,
           excerpt = ?,
           hero_image_key = ?,
           hero_image_alt = ?,
           author = ?,
           author_role = ?,
           body_markdown = ?,
           og_description = ?,
           tags_json = ?,
           faq_json = ?,
           status = ?,
           published_url = ?,
           source_path = ?,
           updated_by = ?,
           updated_at = ?
         WHERE id = ? AND client_id = ?`)
            .bind(postType, nextSlug, title, normalizeString(payload.date) || new Date().toISOString().slice(0, 10), categorySlug, categoryLabel, excerpt, payload.heroImageKey || null, payload.heroImageAlt || null, normalizeString(payload.author) || config.defaultAuthor, payload.authorRole || null, bodyMarkdown, payload.ogDescription || null, JSON.stringify(Array.isArray(payload.tags) ? payload.tags : []), JSON.stringify(Array.isArray(payload.faq) ? payload.faq : []), status, nextPublishedUrl, nextSourcePath, user.id, now, ctx.params.id, user.client_id)
            .run();
        if (result.meta.changes === 0) {
            return json({ ok: false, error: "not_found" }, { status: 404 });
        }
        if (slugChanged && prior.published_url && nextPublishedUrl) {
            const recorded = await recordRedirect(db, user.client_id, prior.id, prior.published_url, nextPublishedUrl);
            if (!recorded) {
                warning = joinWarnings(warning, "旧 URL からの転送を記録できませんでした（migration 0008 が未適用の可能性があります）。");
            }
        }
        if (slugChanged) {
            await recordAudit(db, ctx.request, user, {
                action: "post.rename",
                targetType: "post",
                targetId: prior.id,
                summary: `${prior.slug} → ${nextSlug}`,
            });
        }
        return json({
            ok: true,
            slug: nextSlug,
            publishedUrl: nextPublishedUrl,
            ...(warning ? { warning } : {}),
        });
    };
    const onRequestDelete = async (ctx) => {
        // 物理削除で復元手段が無いため、許可するロールを設定で絞る（既定は管理者のみ）。
        const user = await requireUser(ctx.request, ctx.env, config, config.permissions.deletePost);
        if (user instanceof Response)
            return user;
        const db = requireDb(ctx.env);
        if (db instanceof Response)
            return db;
        const post = await db
            .prepare("SELECT id, slug, status, published_url, source_path FROM post_drafts WHERE id = ? AND client_id = ? LIMIT 1")
            .bind(ctx.params.id, user.client_id)
            .first();
        if (!post)
            return json({ ok: false, error: "not_found" }, { status: 404 });
        // GitHub 上に Markdown がある（公開済み/反映中、または取り込み元あり）場合は、
        // サイトからも消えるよう先にファイルを削除する。未公開の下書きはファイルが無いのでスキップ。
        //
        // 既知の穴: 公開を取り下げた記事はこの条件から外れる（status は draft、published_url は NULL）。
        // 取り下げは `draft: true` で上書きするだけでファイルを消さないため、取り下げてから削除すると
        // GitHub 側にファイルが残る。導入先のサイトが draft を見て除外していれば表示はされない。
        if (hasGitHubFile(post)) {
            const removed = await deleteGitHubFile(ctx.env, config, post.source_path || postFilePath(config, post.slug), `post: delete ${post.slug} from admin`);
            // github.mode: "backup" のサイトは公開ページが D1 を直接読むため、
            // 控えのファイルを消せなくても記事の削除自体は進める（消し残しは次の公開で上書きされる）。
            if (removed instanceof Response && config.github.mode !== "backup")
                return removed;
        }
        // 子レコードを後始末してから本体を削除する（revisions は FK 制約あり）。
        // 注: R2 上のアセット実体は残る（DB の asset 行のみ削除）。R2 の掃除は別途。
        await db.prepare("DELETE FROM revisions WHERE post_id = ?").bind(post.id).run();
        await db
            .prepare("DELETE FROM assets WHERE post_id = ? AND client_id = ?")
            .bind(post.id, user.client_id)
            .run();
        // 旧 URL からの転送も消す（記事が無いのに 301 で飛ばすと、行き先が 404 になる）。
        // 転送表が無いサイト（migration 0008 未適用）では飛ばす。
        try {
            await db
                .prepare("DELETE FROM post_redirects WHERE post_id = ? AND client_id = ?")
                .bind(post.id, user.client_id)
                .run();
        }
        catch {
            // 表が無いだけなので何もしない
        }
        const result = await db
            .prepare("DELETE FROM post_drafts WHERE id = ? AND client_id = ?")
            .bind(post.id, user.client_id)
            .run();
        if (result.meta.changes === 0) {
            return json({ ok: false, error: "not_found" }, { status: 404 });
        }
        await recordAudit(db, ctx.request, user, {
            action: "post.delete",
            targetType: "post",
            targetId: post.id,
            summary: post.slug,
        });
        return json({ ok: true });
    };
    return { onRequestGet, onRequestPut, onRequestDelete };
}
