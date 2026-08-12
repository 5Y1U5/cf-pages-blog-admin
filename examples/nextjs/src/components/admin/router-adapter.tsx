"use client";

import NextLink from "next/link";
import { useSearchParams } from "next/navigation";
import type { AdminRouter } from "@5y1u5/cf-pages-blog-admin/ui";

export const adminRouter: AdminRouter = {
  Link: ({ href, className, children }) => (
    <NextLink href={href} className={className}>
      {children}
    </NextLink>
  ),
  navigate: (href) => window.location.assign(href),
  useSearchParam: (name) => useSearchParams().get(name),
};
