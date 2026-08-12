import { Suspense } from "react";
import { AdminEditorClient } from "@5y1u5/cf-pages-blog-admin/ui";
import { blogAdminConfig } from "../../../../blog-admin.config";
import { adminRouter } from "@/components/admin/router-adapter";

export default function Page() {
  return (
    <Suspense fallback={null}>
      <AdminEditorClient config={blogAdminConfig} router={adminRouter} />
    </Suspense>
  );
}
