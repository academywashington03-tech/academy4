import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/supabase/config";

// Public catalog is indexable; every private/transactional area is not.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: ["/", "/courses", "/bundles"], disallow: ["/admin", "/api", "/dashboard", "/learn", "/quizzes", "/checkout", "/orders", "/certificates", "/verify", "/settings", "/notifications", "/login", "/register", "/auth"] }],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
