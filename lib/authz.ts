// Pure route-authorization rules. The server layouts re-check with the real profile from the DB;
// this module is the single source of truth for WHICH roles may open WHICH paths.
export type Role = "super_admin" | "instructor" | "student";
export type Decision = "allow" | "login" | "forbidden";

const STUDENT_PREFIXES = ["/dashboard", "/my-courses", "/learn", "/orders", "/certificates", "/settings", "/quizzes", "/checkout", "/notifications"];
// Instructors may enter /admin but only super_admin may open these sections.
const ADMIN_ONLY = ["/admin/settings", "/admin/orders", "/admin/manual-payments", "/admin/coupons", "/admin/bundles",
  "/admin/instructors", "/admin/students", "/admin/audit-log", "/admin/categories", "/admin/courses/new", "/admin/certificates", "/admin/testimonials", "/admin/reports", "/admin/announcements/platform"];

const under = (path: string, prefix: string) => path === prefix || path.startsWith(prefix + "/");

export function isProtectedPath(path: string) {
  return under(path, "/admin") || STUDENT_PREFIXES.some((p) => under(path, p));
}

export function decide(role: Role | null, suspended: boolean, path: string): Decision {
  if (!isProtectedPath(path)) return "allow";
  if (!role) return "login";
  if (suspended) return "forbidden";
  if (under(path, "/admin")) {
    if (role === "student") return "forbidden";
    if (ADMIN_ONLY.some((p) => under(path, p)) && role !== "super_admin") return "forbidden";
  }
  return "allow";
}
