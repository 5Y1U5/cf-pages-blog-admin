import { createPostDetailHandlers } from "@5y1u5/cf-pages-blog-admin/server/handlers/posts/detail";
import { blogAdminConfig } from "../../../../blog-admin.config";

export const { onRequestGet, onRequestPut, onRequestDelete } = createPostDetailHandlers(blogAdminConfig);
