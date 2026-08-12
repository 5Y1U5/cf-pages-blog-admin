/**
 * 管理画面の画面パスと API パス。
 * 設定項目にはしていない（導入先で値を変える理由が無く、増やすと設定と実装の両方に
 * 追従コストが生じるため）。変えたくなったらここを1か所直す。
 */
export const ADMIN_PATHS = {
    login: "/admin/login",
    posts: "/admin/posts",
    users: "/admin/users",
    editor: "/admin/editor",
};
export const ADMIN_API = {
    me: "/api/admin/me",
    login: "/api/admin/auth/login",
    logout: "/api/admin/auth/logout",
    posts: "/api/admin/posts/",
    categories: "/api/admin/categories/",
    users: "/api/admin/users/",
    assetUpload: "/api/admin/assets/upload",
};
export function postApi(id) {
    return `/api/admin/posts/${encodeURIComponent(id)}`;
}
export function categoryApi(id) {
    return `/api/admin/categories/${encodeURIComponent(id)}`;
}
export function userApi(id) {
    return `/api/admin/users/${encodeURIComponent(id)}`;
}
export function editorPath(id) {
    return id ? `${ADMIN_PATHS.editor}?id=${encodeURIComponent(id)}` : ADMIN_PATHS.editor;
}
