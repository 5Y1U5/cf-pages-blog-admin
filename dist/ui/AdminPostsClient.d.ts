import { type ReactNode } from "react";
import type { BlogAdminConfig } from "../config/index.js";
import type { AdminRouter } from "./router.js";
export interface AdminPostsClientProps {
    config: BlogAdminConfig;
    router: AdminRouter;
    /**
     * ヘッダーに足したい導入先固有のボタン（管理者にだけ表示される）。
     * この画面に無い機能へのリンクを、パッケージ側に持ち込まずに置けるようにするための口。
     */
    headerActions?: ReactNode;
}
export declare function AdminPostsClient({ config, router, headerActions }: AdminPostsClientProps): import("react").JSX.Element;
