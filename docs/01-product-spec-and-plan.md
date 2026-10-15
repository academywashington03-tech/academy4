# Washington Academy — Product Spec, Page Map, Plan (Phase 1)

## Roles
| Role | Can do | Cannot do |
|---|---|---|
| super_admin | Everything, incl. payments, settings, roles | — |
| instructor | Manage ONLY assigned courses/lessons/quizzes, see their students | Payments, settings, other courses |
| student | Own profile, enrolled courses, quizzes, certificates, own orders | Anything administrative |

First super admin: created via a documented SQL step (Phase 3), never via public sign-up. A DB trigger forces every new sign-up to `student`.

## Page map
**Public (Arabic default, English optional):** home, /courses (search/filter/sort), /courses/[slug], /categories/[slug], /instructors/[id], /bundles/[slug], /verify/[certificateNo], /contact, /privacy, /terms, /refund-policy.
**Auth:** /login, /register, /forgot-password, /reset-password.
**Student (noindex):** /dashboard, /my-courses, /learn/[course]/[lesson], /quizzes/[id], /certificates, /orders, /settings.
**Checkout:** /checkout/[courseOrBundle], /checkout/manual/[orderId], /checkout/result (display only, never grants access).
**Admin/Instructor (noindex):** /admin overview, courses (+editor: sections, lessons, resources), categories, students, instructors, orders, manual-payments, coupons, bundles, quizzes, certificates, announcements, reports, settings, audit-log.
**API:** /api/webhooks/paymob, /api/checkout, /api/lessons/[id]/access, /api/progress, /api/quiz/[id]/submit, /api/certificates/issue.

## Non-negotiable rules
1. Prices are computed on the server from the DB; client price is ignored.
2. Access is granted ONLY by a row in `enrollments` created by the fulfillment function.
3. One DB function (`fulfill_order`) is used by both Paymob webhook and manual approval; it locks the order, so duplicate webhooks do nothing.
4. Webhook: verify HMAC per Paymob docs, then re-check amount, currency, order reference, success flag.
5. Money = integer minor units (piastres). Default currency EGP.
6. Quiz correct answers never reach the browser; grading is server-side.
7. Video: Cloudflare Stream signed tokens. PDFs: private bucket + short-lived signed URLs. Neither prevents screen recording, and the UI will not claim it does.

## Phases
1 Spec+schema (now) · 2 Brand+public site · 3 Auth+roles · 4 Admin/course editor · 5 Student+player · 6 Orders+Paymob · 7 Bundles/subs/coupons/manual · 8 Quizzes+certificates · 9 Notifications/reports/settings · 10 Security tests · 11 Deployment.

## Must be verified externally (not assumed)
Current Supabase/Vercel/Cloudflare/email free limits and prices; Paymob onboarding, Egyptian payment methods, fees, HMAC format, recurring-payment support. Checked via web search before Phase 6 and before the cost table.
