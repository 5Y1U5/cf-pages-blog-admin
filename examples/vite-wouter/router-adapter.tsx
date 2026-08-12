// client/src/components/admin/router-adapter.tsx に置く
import { Link as WouterLink } from "wouter";
import { navigate } from "wouter/use-browser-location";
import type { AdminRouter } from "@5y1u5/cf-pages-blog-admin/ui";

export const adminRouter: AdminRouter = {
  Link: ({ href, className, children }) => (
    <WouterLink href={href} className={className}>
      {children}
    </WouterLink>
  ),
  navigate,
  useSearchParam: (name) =>
    new URLSearchParams(typeof window !== "undefined" ? window.location.search : "").get(
      name
    ),
};
