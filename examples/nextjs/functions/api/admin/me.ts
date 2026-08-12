import { createMeHandlers } from "@5y1u5/cf-pages-blog-admin/server/handlers/me";
import { blogAdminConfig } from "../../../blog-admin.config";

export const { onRequestGet } = createMeHandlers(blogAdminConfig);
