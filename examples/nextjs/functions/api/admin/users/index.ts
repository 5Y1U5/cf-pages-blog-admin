import { createUsersHandlers } from "@5y1u5/cf-pages-blog-admin/server/handlers/users/index";
import { blogAdminConfig } from "../../../../blog-admin.config";

export const { onRequestGet, onRequestPost } = createUsersHandlers(blogAdminConfig);
