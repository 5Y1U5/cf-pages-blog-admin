import type { BlogAdminConfig } from "../config/index.js";
import type { AdminRouter } from "./router.js";
export interface AdminEditorClientProps {
    config: BlogAdminConfig;
    router: AdminRouter;
}
export declare function AdminEditorClient({ config, router }: AdminEditorClientProps): import("react").JSX.Element;
