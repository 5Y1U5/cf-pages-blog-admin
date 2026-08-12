import { createAssetUploadHandlers } from "@5y1u5/cf-pages-blog-admin/server/handlers/assets/upload";
import { blogAdminConfig } from "../../../../blog-admin.config";

export const { onRequestPost } = createAssetUploadHandlers(blogAdminConfig);
