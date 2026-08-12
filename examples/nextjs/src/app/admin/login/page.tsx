import { AdminLoginClient } from "@5y1u5/cf-pages-blog-admin/ui";
import { blogAdminConfig } from "../../../../blog-admin.config";

export default function Page() {
  return <AdminLoginClient config={blogAdminConfig} />;
}
