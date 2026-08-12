import { createLoginHandlers } from "@5y1u5/cf-pages-blog-admin/server/handlers/auth/login";
import { blogAdminConfig } from "../../../../blog-admin.config";

export const { onRequestPost } = createLoginHandlers(blogAdminConfig);
