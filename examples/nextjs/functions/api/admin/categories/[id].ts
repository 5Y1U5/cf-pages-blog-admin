import { createCategoryDetailHandlers } from "@5y1u5/cf-pages-blog-admin/server/handlers/categories/detail";
import { blogAdminConfig } from "../../../../blog-admin.config";

export const { onRequestDelete } = createCategoryDetailHandlers(blogAdminConfig);
