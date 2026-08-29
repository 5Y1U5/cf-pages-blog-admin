import type { BlogAdminConfig } from "../config/index.js";
import type { AdminRouter } from "./router.js";
export interface AdminCategoriesClientProps {
    config: BlogAdminConfig;
    router: AdminRouter;
}
export declare function AdminCategoriesClient({ router }: AdminCategoriesClientProps): import("react").JSX.Element;
