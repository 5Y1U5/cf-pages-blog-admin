import { createCategoriesHandlers } from "@5y1u5/cf-pages-blog-admin/server/handlers/categories/index";
import { blogAdminConfig } from "../../../../blog-admin.config";

export const { onRequestGet, onRequestPost } = createCategoriesHandlers(blogAdminConfig);
