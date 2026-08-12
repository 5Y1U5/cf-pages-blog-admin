import type { BlogAdminConfig } from "../config/index.js";
import type { AdminRouter } from "./router.js";
export interface AdminUsersClientProps {
    config: BlogAdminConfig;
    router: AdminRouter;
}
export declare function AdminUsersClient({ router }: AdminUsersClientProps): import("react").JSX.Element;
