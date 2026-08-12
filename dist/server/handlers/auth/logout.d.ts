import type { BlogAdminConfig } from "../../../config/index.js";
import type { BlogAdminEnv } from "../../../config/env.js";
export declare function createLogoutHandlers(config: BlogAdminConfig): {
    onRequestPost: PagesFunction<BlogAdminEnv, any, Record<string, unknown>>;
};
