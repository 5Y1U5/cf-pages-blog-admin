import type { BlogAdminConfig } from "../../../config/index.js";
import type { BlogAdminEnv } from "../../../config/env.js";
export declare function createCategoryDetailHandlers(config: BlogAdminConfig): {
    onRequestDelete: PagesFunction<BlogAdminEnv, any, Record<string, unknown>>;
};
