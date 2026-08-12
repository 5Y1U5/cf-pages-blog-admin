import { defineBlogAdminConfig } from "@5y1u5/cf-pages-blog-admin/config";

export const blogAdminConfig = defineBlogAdminConfig({
  clientId: "demo",
  defaultAuthor: "Demo Author",
  sessionCookieName: "__Host-demo_admin_session",
  brandLabel: "DEMO ADMIN",
  content: {
    postsDir: "content/blog",
    heroImageKey: "hero",
    defaultHeroImage: "/og-image.jpg",
  },
  github: {
    owner: "demo-owner",
    repo: "demo-repo",
    branch: "main",
  },
});
