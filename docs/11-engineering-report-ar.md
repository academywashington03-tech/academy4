# تقرير الفحص والإصلاح الهندسي — أكاديمية واشنطن (15 أكتوبر 2026)

> **تحديث:** أُجريت مراجعة ثانية بعد هذا التقرير؛ انظر [12-review-round-2-ar.md](12-review-round-2-ar.md) (ثغرات إعادة توجيه مفتوحة، وربط معاملة الدفع بطلب واحد، وإصلاح إصدار الشهادات على Supabase).

> كل ما يلي نُفِّذ فعلاً في بيئة معزولة **بلا وصول إلى سجل npm**؛ لذلك لم يُثبَّت `next` ولم يُنفَّذ `next build`. التفاصيل في قسم «ما لم يمكن اختباره».

## 1) نتائج التشغيل الفعلية
| الفحص | النتيجة |
|---|---|
| `node --test tests/*.test.ts` (وحدات + فحوص أمنية ثابتة) | ✅ **78 ناجحاً، 0 فاشل** (76 قائمة + اختباران جديدان) |
| تطبيق الترحيلات 0001→0010 على PostgreSQL 16.15 حقيقي (مع محاكاة لمخططات `auth`/`storage` الخاصة بـSupabase) | ✅ بلا أخطاء |
| ملفات اختبار SQL الثمانية (`supabase/tests/*`) | ✅ **نجحت كلها (54 تأكيداً PASS)** — قبل الإصلاح: 2 فشلا من أصل 8 |
| فحص TypeScript بحزم بديلة مرنة (لا تتحقق من أنواع Next/React/Supabase) | ✅ لا أخطاء صياغة أو استيراد/تصدير أو منطق TypeScript عادي في كود المشروع |
| `npm install` / `npm run typecheck` الحقيقي / `npm run build` / `npm run lint` | ⛔ **لم تُنفَّذ**: `registry.npmjs.org` لا يُحل عبر DNS من هذه البيئة |
| e2e (Playwright) | ⛔ لم تُنفَّذ (تتطلب بناء التطبيق) |
| Supabase الحقيقي، Paymob، Cloudflare Stream، البريد، Vercel | ⛔ لا حسابات ولا مفاتيح ولا شبكة — لم يُدَّعَ نجاح أي منها |

## 2) المشكلات المكتشفة والإصلاحات (مرتبة بالخطورة)
| # | الخطورة | المشكلة | الإصلاح |
|---|---|---|---|
| 1 | **عالية (مالية)** | في `price_item` كان شرط نطاق الكوبون `cp.course_id = p_course OR cp.bundle_id = p_bundle`؛ حين يكون أحد المعاملين NULL تصبح النتيجة NULL فيُقبل **كوبون مخصص لدورة A على دورة B**. اكتُشف باختبار `phase7_checks.sql` | منطق آمن للـNULL في `0010_phase12_sql_fixes.sql` |
| 2 | **عالية (وظيفية)** | متغير `code` داخل `price_item` يتعارض مع عمود `coupons.code` ⇒ `column reference "code" is ambiguous` ⇒ **كل عملية شراء/عرض سعر بكوبون تفشل** وقت التشغيل | إعادة التسمية إلى `v_code` (في 0010، آمن لقاعدة طُبّقت عليها 0005) |
| 3 | متوسطة | جدول `rate_limits` يعتمد على RLS فقط؛ Supabase يمنح `anon/authenticated` صلاحيات افتراضية على جداول `public` (اختبار `phase10` توقّع «permission denied») | `REVOKE ALL` في 0010 |
| 4 | متوسطة | `scripts/run-sql-checks.sh` فقد صلاحية التنفيذ في الأرشيف ⇒ `npm run test:sql` يفشل بـ«Permission denied» | `chmod +x` + أصبح الأمر `bash scripts/run-sql-checks.sh` |
| 5 | متوسطة | `npm run lint` يشغّل `next lint` بلا ESLint ولا إعداد (يطلب تهيئة تفاعلية ويفشل في CI) | أُضيف `eslint` و`eslint-config-next` و`eslint.config.mjs` + خطوة CI استشارية. **غير مُجرَّب** |
| 6 | متوسطة | إن تُرك `NEXT_PUBLIC_SITE_URL` على `localhost` في الإنتاج يُرسل العميل للدفع ولا يصل إشعار Paymob أبداً (دفع بلا تفعيل) | `startOnlinePayment` يرفض (`not_configured`) في الإنتاج إن لم يكن العنوان https علنياً |
| 7 | منخفضة | الدفع الإلكتروني كان ينشئ طلباً معلّقاً ثم يكتشف أن الهاتف/البريد ناقص (طلبات يتيمة + استهلاك حد المعدل) | التحقق من الملف الشخصي **قبل** إنشاء الطلب |
| 8 | منخفضة | مقارنة `CRON_SECRET` بـ`!==` (غير ثابتة الزمن) | `lib/secure-compare.ts` (SHA-256 + `timingSafeEqual`) + اختباران |
| 9 | منخفضة | `next build` سيُشغّل ESLint الآن فقد يُفشل البناء بقاعدة أسلوبية | `eslint.ignoreDuringBuilds` — الفحص يبقى خطوة مستقلة (`npm run lint`) |

## 3) ما راجعته ووجدته سليماً (دون تعديل)
- توقيع Paymob: الحقول العشرون وترتيبها مطابقة للتوثيق، المقارنة ثابتة الزمن، التوثيق قبل أي معالجة، التفعيل فقط من الـwebhook، المبلغ يُؤخذ من الحمولة الموقَّعة ويُطابق في قاعدة البيانات، والتكرار آمن (اختبارات SQL والوحدات).
- كل إجراءات الخادم الإدارية تعيد التحقق من الدور من قاعدة البيانات، وRLS قفل ثانٍ؛ المسارات `/admin/*` للمدير فقط حسب `lib/authz.ts`.
- الأسرار: لا مفاتيح في الكود؛ `.env.example` أسماء فقط؛ `.gitignore` يحمي `.env*` والمفاتيح.
- `service_role` محصور في ملفات `server-only`.

## 4) الملفات المنشأة/المعدّلة
**جديدة:** `supabase/migrations/0010_phase12_sql_fixes.sql` · `lib/secure-compare.ts` · `tests/secure-compare.test.ts` · `eslint.config.mjs` · `docs/11-engineering-report-ar.md` (هذا الملف).
**معدّلة:** `package.json` (سكربت `test:sql`، تبعيات ESLint) · `next.config.mjs` · `app/api/cron/emails/route.ts` · `app/checkout/actions.ts` · `.github/workflows/ci.yml` · `scripts/run-sql-checks.sh` (صلاحية التنفيذ) · `README.md` و`PROJECT_STATUS.md` و`docs/02,05,09` (عدد الترحيلات ونتائج الفحص).

## 5) ما لم يمكن اختباره ولماذا (والبديل)
1. **التثبيت والبناء والأنواع الحقيقية والـlint:** لا اتصال بسجل npm. البديل المنفَّذ: اختبارات الوحدات (تعمل بلا اعتماديات)، وفحص صياغة/استيراد بأنواع بديلة. **أنت** نفّذ: `npm install && npm run typecheck && npm test && npm run build && npm run lint`، وارفع `package-lock.json`.
2. **إصدار `next@15.5.21`:** مثبَّت في المشروع ولم أتمكن من التأكد من وجوده في السجل. إن فشل التثبيت بـ`No matching version` فاستبدله بأحدث `15.5.x` متاحة، وكذلك `eslint-config-next` ليطابقه.
3. **Supabase الحقيقي:** اختبارات SQL شُغّلت على PostgreSQL محلي مع **محاكاة** لـ`auth.uid()` وجداول `auth.users`/`storage`؛ لذا أعد تشغيل `npm run test:sql` على مشروع Supabase **تجريبي** (انظر `docs/09-supabase-setup-ar.md`). لم تُختبر سياسات Storage على Supabase فعلياً.
4. **Paymob:** لا حساب ولا مفاتيح. اتبع `docs/10-paymob-setup-ar.md` (وضع الاختبار) وتحقق من أن `order.merchant_order_id` يطابق `special_reference`.
5. **النشر على Vercel، الدومين، Cloudflare Stream، البريد (Resend):** تحتاج حساباتك — لم يُنشر شيء ولا يوجد رابط.
6. **مراجعة تصميم الجوال/RTL بصرياً واختبارات e2e:** تحتاج تشغيل التطبيق.

## 6) ما يحتاج تدخلاً بشرياً (بالترتيب)
1. جهاز بإنترنت: التثبيت + typecheck + test + build + lint، وإصلاح أي خطأ يظهر (أرسله لي لأصلحه).
2. مشروع Supabase تجريبي: الترحيلات 0001→0010، ثم `npm run test:sql` على `DATABASE_URL` الخاص به.
3. مشروع Supabase الإنتاجي: الترحيلات، إعداد المصادقة، المدير الأول.
4. Vercel: متغيرات البيئة (`.env.example`)، `NEXT_PUBLIC_SITE_URL` بـhttps، `CRON_SECRET`.
5. Paymob: مفاتيح الاختبار، رابط الإشعار `https://<دومينك>/api/webhooks/paymob`، دفعة تجريبية، ثم المفاتيح الحية.
6. مراجعة السياسات القانونية من `/admin/settings`.
