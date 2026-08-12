import type { BlogAdminConfig } from "../../../config/index.js";
import type { BlogAdminEnv } from "../../../config/env.js";
export declare function createLoginHandlers(config: BlogAdminConfig): {
    onRequestPost: PagesFunction<BlogAdminEnv, any, Record<string, unknown>>;
};
