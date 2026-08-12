import { createUserDetailHandlers } from "@5y1u5/cf-pages-blog-admin/server/handlers/users/detail";
import { blogAdminConfig } from "../../../../blog-admin.config";

export const { onRequestPut, onRequestDelete } = createUserDetailHandlers(blogAdminConfig);
