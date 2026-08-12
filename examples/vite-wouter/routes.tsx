// 既存の <Switch> / <Route> の中に足す
import { Route } from "wouter";
import {
  AdminEditorClient,
  AdminLoginClient,
  AdminPostsClient,
  AdminUsersClient,
} from "@5y1u5/cf-pages-blog-admin/ui";

import { blogAdminConfig } from "../../blog-admin.config";
import { adminRouter } from "./components/admin/router-adapter";

export function AdminRoutes() {
  return (
    <>
      <Route path="/admin/login">{() => <AdminLoginClient config={blogAdminConfig} />}</Route>
      <Route path="/admin/posts">
        {() => <AdminPostsClient config={blogAdminConfig} router={adminRouter} />}
      </Route>
      <Route path="/admin/editor">
        {() => <AdminEditorClient config={blogAdminConfig} router={adminRouter} />}
      </Route>
      <Route path="/admin/users">
        {() => <AdminUsersClient config={blogAdminConfig} router={adminRouter} />}
      </Route>
    </>
  );
}
