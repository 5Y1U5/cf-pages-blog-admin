/**
 * 管理画面の画面パスと API パス。
 * 設定項目にはしていない（導入先で値を変える理由が無く、増やすと設定と実装の両方に
 * 追従コストが生じるため）。変えたくなったらここを1か所直す。
 */
export declare const ADMIN_PATHS: {
    readonly login: "/admin/login";
    readonly posts: "/admin/posts";
    readonly users: "/admin/users";
    readonly editor: "/admin/editor";
};
export declare const ADMIN_API: {
    readonly me: "/api/admin/me";
    readonly login: "/api/admin/auth/login";
    readonly logout: "/api/admin/auth/logout";
    readonly posts: "/api/admin/posts/";
    readonly categories: "/api/admin/categories/";
    readonly users: "/api/admin/users/";
    readonly assetUpload: "/api/admin/assets/upload";
};
export declare function postApi(id: string): string;
export declare function categoryApi(id: string): string;
export declare function userApi(id: string): string;
export declare function editorPath(id?: string): string;
