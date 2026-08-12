import { createUnpublishHandlers } from "@5y1u5/cf-pages-blog-admin/server/handlers/posts/unpublish";
import { blogAdminConfig } from "../../../../../blog-admin.config";

export const { onRequestPost } = createUnpublishHandlers(blogAdminConfig);
