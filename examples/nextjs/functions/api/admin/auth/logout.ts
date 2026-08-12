import { createLogoutHandlers } from "@5y1u5/cf-pages-blog-admin/server/handlers/auth/logout";
import { blogAdminConfig } from "../../../../blog-admin.config";

export const { onRequestPost } = createLogoutHandlers(blogAdminConfig);
