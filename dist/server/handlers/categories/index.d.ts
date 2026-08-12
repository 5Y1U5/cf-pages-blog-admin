import type { BlogAdminConfig } from "../../../config/index.js";
import type { BlogAdminEnv } from "../../../config/env.js";
export declare function createCategoriesHandlers(config: BlogAdminConfig): {
    onRequestGet: PagesFunction<BlogAdminEnv, any, Record<string, unknown>>;
    onRequestPost: PagesFunction<BlogAdminEnv, any, Record<string, unknown>>;
};
