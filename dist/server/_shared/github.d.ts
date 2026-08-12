import type { BlogAdminConfig } from "../../config/index.js";
import type { BlogAdminEnv } from "../../config/env.js";
export declare function upsertGitHubFile(env: BlogAdminEnv, config: BlogAdminConfig, path: string, content: string, message: string): Promise<{
    ok: true;
    commitSha: string | null;
} | Response>;
export declare function deleteGitHubFile(env: BlogAdminEnv, config: BlogAdminConfig, path: string, message: string): Promise<{
    ok: true;
    commitSha: string | null;
    existed: boolean;
} | Response>;
