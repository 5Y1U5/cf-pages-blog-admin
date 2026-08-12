import { createPostsHandlers } from "@5y1u5/cf-pages-blog-admin/server/handlers/posts/index";
import { blogAdminConfig } from "../../../../blog-admin.config";

export const { onRequestGet, onRequestPost } = createPostsHandlers(blogAdminConfig);
