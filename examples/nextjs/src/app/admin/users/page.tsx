import { AdminUsersClient } from "@5y1u5/cf-pages-blog-admin/ui";
import { blogAdminConfig } from "../../../../blog-admin.config";
import { adminRouter } from "@/components/admin/router-adapter";

export default function Page() {
  return <AdminUsersClient config={blogAdminConfig} router={adminRouter} />;
}
