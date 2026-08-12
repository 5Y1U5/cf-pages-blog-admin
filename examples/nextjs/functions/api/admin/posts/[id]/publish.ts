import { createPublishHandlers } from "@5y1u5/cf-pages-blog-admin/server/handlers/posts/publish";
import { blogAdminConfig } from "../../../../../blog-admin.config";

export const { onRequestPost } = createPublishHandlers(blogAdminConfig);
