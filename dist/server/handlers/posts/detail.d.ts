import { type BlogAdminConfig } from "../../../config/index.js";
import type { BlogAdminEnv } from "../../../config/env.js";
export declare function createPostDetailHandlers(config: BlogAdminConfig): {
    onRequestGet: PagesFunction<BlogAdminEnv, any, Record<string, unknown>>;
    onRequestPut: PagesFunction<BlogAdminEnv, any, Record<string, unknown>>;
    onRequestDelete: PagesFunction<BlogAdminEnv, any, Record<string, unknown>>;
};
