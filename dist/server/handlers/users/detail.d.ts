import type { BlogAdminConfig } from "../../../config/index.js";
import type { BlogAdminEnv } from "../../../config/env.js";
export declare function createUserDetailHandlers(config: BlogAdminConfig): {
    onRequestPut: PagesFunction<BlogAdminEnv, any, Record<string, unknown>>;
    onRequestDelete: PagesFunction<BlogAdminEnv, any, Record<string, unknown>>;
};
