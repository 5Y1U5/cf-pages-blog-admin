import { AdminPostsClient } from "@5y1u5/cf-pages-blog-admin/ui";
import { blogAdminConfig } from "../../../../blog-admin.config";
import { adminRouter } from "@/components/admin/router-adapter";

export default function Page() {
  return <AdminPostsClient config={blogAdminConfig} router={adminRouter} />;
}
