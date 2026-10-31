import type { MetadataRoute } from "next";

// SPEC-deploy: friends get the link directly; nothing here is for search engines.
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", disallow: "/" } };
}
