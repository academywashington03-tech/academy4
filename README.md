# أكاديمية واشنطن — Washington Academy

منصة تعليم إلكتروني عربية (RTL) كاملة: تسجيل ودخول، دورات ودروس وفيديو وملفات PDF، لوحات للطالب والمدرّس والمدير، دفع إلكتروني عبر Paymob ودفع يدوي بمراجعة المدير، تفعيل تلقائي بعد التحقق من الدفع، كوبونات وحزم واشتراكات مسبقة الدفع، اختبارات وشهادات مع صفحة تحقق عامة، إشعارات وتقارير وسجل تدقيق.

> ## الحالة الصادقة للمشروع
> - **الكود مكتوب بالكامل، لكن `npm install` و`npm run typecheck` و`npm run build` و`npm run lint` لم تُنفَّذ بعد** (بيئة التجهيز بلا إنترنت). نفّذها على جهاز متصل.
> - لم تُشغَّل ملفات قاعدة البيانات (SQL) ولا اختبارات `supabase/tests` على قاعدة حقيقية أو تجريبية، ولم تُجرَّب عملية دفع واحدة.
> - المُتحقَّق منه فعلاً (تشغيل حقيقي): `node --test tests/*.test.ts` → **85 اختباراً ناجحاً من 85** على Node 22.22.
> - سجل التحقق التفصيلي: [docs/13-technical-verification-ar.md](docs/13-technical-verification-ar.md).
> - قراءة [قائمة الاختبارات والأمان](docs/03-test-and-security-checklist.md) تبيّن بالضبط ما نجح وما ينتظر بيئة حقيقية.

## التقنيات
Next.js 15.5 (App Router) · React 19 · TypeScript · Tailwind CSS 3 · Supabase (PostgreSQL + Auth + Storage) · Paymob (دفع) · Cloudflare Stream (فيديو محمي) · Resend (بريد) · Vercel (استضافة).
تحتاج Node.js **22.18 أو أحدث** (انظر `.nvmrc`).

> 🚀 **تريد نشر الموقع ولا تعرف البرمجة؟** اتبع [دليل النشر للمبتدئين](docs/00-publish-beginner-ar.md).

## بدء سريع على جهازك
```bash
npm install
cp .env.example .env.local        # ثم املأ القيم (انظر دليل Supabase)
node scripts/check-env.mjs        # يفحص أي المتغيرات مضبوطة دون طباعة قيمها
npm run dev                       # http://localhost:3000
```
التفاصيل: [دليل التثبيت والتشغيل](docs/08-install-and-run-ar.md).

## الأوامر
| الأمر | الوظيفة |
|---|---|
| `npm run dev` | تشغيل للتطوير |
| `npm run build` / `npm start` | بناء وتشغيل نسخة الإنتاج |
| `npm run typecheck` | فحص TypeScript |
| `npm run lint` | ESLint (`eslint .`) |
| `npm test` | اختبارات الوحدات والفحوص الأمنية (لا تحتاج إنترنت) |
| `npm run check` | فحص الأنواع + الاختبارات |
| `npm run test:sql` | يشغّل اختبارات قاعدة البيانات على **قاعدة تجريبية** (يحتاج `psql`) |
| `npm run test:e2e` | اختبارات المتصفح على موقع شغّال (Playwright) |
| `node scripts/check-env.mjs [--production]` | فحص متغيرات البيئة دون كشف قيمها |

## متغيرات البيئة
تُنسخ من `.env.example` إلى `.env.local` محلياً، وتُضاف في إعدادات Vercel عند النشر. **لا تضع أي قيمة في الكود أو في Git.** الفحص: `node scripts/check-env.mjs [--production]` (لا يطبع القيم).

| المتغير | مطلوب؟ | ملاحظة |
|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | نعم | عنوان الموقع (محلياً `http://localhost:3000`) |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | نعم | من مشروع Supabase (عامّان) |
| `SUPABASE_SERVICE_ROLE_KEY` | نعم | خادم فقط، لا يُسبق بـ `NEXT_PUBLIC_` |
| `PAYMOB_SECRET_KEY`, `PAYMOB_PUBLIC_KEY`, `PAYMOB_INTEGRATION_ID`, `PAYMOB_HMAC_SECRET` | للدفع الإلكتروني | استخدم مفاتيح **الاختبار** حتى اعتماد الحساب؛ لا تخلط الاختبار بالحقيقي |
| `PAYMOB_BASE_URL` | اختياري | الافتراضي `https://accept.paymob.com` |
| `CRON_SECRET` | للإنتاج | نص عشوائي طويل لحماية `/api/cron/emails` |
| `EMAIL_PROVIDER_API_KEY`, `EMAIL_FROM` | اختياري | إشعارات البريد |
| `CLOUDFLARE_STREAM_CUSTOMER_CODE`, `CLOUDFLARE_STREAM_SIGNING_KEY_ID`, `CLOUDFLARE_STREAM_SIGNING_KEY_PEM` | اختياري | الفيديو المحمي |
| `NEXT_PUBLIC_GOOGLE_ENABLED`, `NEXT_PUBLIC_CONTACT_EMAIL` | اختياري | |
| `CSP_ENFORCE` | اختياري | فارغ = وضع التقرير فقط؛ `1` بعد مراجعة الـ console |
| `DATABASE_URL` | للاختبارات فقط | قاعدة **تجريبية** منفصلة، لا تضعها في Vercel أبداً |

## التكامل المستمر (CI)
ملف `.github/workflows/ci.yml` يعمل عند كل push وpull request: تثبيت الاعتماديات ← `typecheck` ← `lint` (استشاري حتى أول تشغيل نظيف) ← `npm test` ← `npm run build` بلا أي أسرار. وهناك مهمة `sql-checks` **يدوية فقط** تحتاج سرّ المستودع `TEST_DATABASE_URL` لقاعدة تجريبية. بعد أول `npm install` ارفع `package-lock.json` إلى Git ليستخدم CI الأمر `npm ci`.

## النشر (ملخص)
1. أنشئ مشروع Supabase، ثم شغّل `supabase/migrations/0001 → 0011` بالترتيب ([دليل 09](docs/09-supabase-setup-ar.md)).
2. ارفع الكود إلى GitHub وتأكد أن CI أخضر.
3. استورد المستودع في Vercel وأضف متغيرات البيئة أعلاه (بيئة Production)، ثم انشر. `vercel.json` يضبط مهمة البريد اليومية.
4. في Paymob اجعل رابط الإشعار `https://<موقعك>/api/webhooks/paymob` (راجع [دليل 10](docs/10-paymob-setup-ar.md)) وجرّب بمفاتيح الاختبار أولاً.
5. شغّل `node scripts/check-env.mjs --production` قبل فتح الموقع للجمهور. التفاصيل: [دليل النشر](docs/05-deployment-guide.md).

## الوثائق
| الملف | المحتوى |
|---|---|
| [08 دليل التثبيت والتشغيل](docs/08-install-and-run-ar.md) | تشغيل المشروع على جهازك |
| [09 إعداد Supabase](docs/09-supabase-setup-ar.md) | قاعدة البيانات والمصادقة والتخزين والمدير الأول |
| [10 إعداد Paymob](docs/10-paymob-setup-ar.md) | الدفع الإلكتروني والتفعيل التلقائي |
| [05 دليل النشر](docs/05-deployment-guide.md) | GitHub ثم Vercel ثم الدومين |
| [07 دليل الإدارة](docs/07-owner-manual-ar.md) | إضافة الكورسات والدروس وPDF من الموبايل |
| [06 الخدمات والتكاليف](docs/06-costs.md) | جدول التكاليف المتحقَّق منها |
| [03 الاختبارات والأمان](docs/03-test-and-security-checklist.md) | ما اختُبر وما لم يُختبر |
| [PROJECT_STATUS.md](PROJECT_STATUS.md) | **الحالة الكاملة: المنجز، المحدود، الناقص، ومتطلبات الاستضافة** |
| [01 المواصفات](docs/01-product-spec-and-plan.md) و[02 سجل الإعداد](docs/02-supabase-setup-and-first-admin.md) | وثائق سابقة (02 تاريخية؛ استخدم 09 بدلاً منها) |

## هيكل المشروع
```
app/            صفحات Next.js (عامة، الطالب، الإدارة، واجهات API)
components/     مكوّنات الواجهة
lib/            المنطق المشترك (الصلاحيات، الدفع، الاختبارات، البريد…)
supabase/
  migrations/   11 ملف ترحيل تُشغَّل بالترتيب 0001 → 0011
  tests/        اختبارات SQL للصلاحيات والدفع (تُشغَّل على قاعدة تجريبية)
tests/          اختبارات الوحدات والفحوص الأمنية الآلية
e2e/            اختبارات المتصفح (Playwright)
scripts/        check-env.mjs و run-sql-checks.sh
docs/           الوثائق
public/brand/   الشعارات
```

## الأمان باختصار
- لا أسرار في الكود؛ كل شيء في متغيرات البيئة (`.env.example` أسماء فقط، و`.gitignore` يحجب `.env*` والمفاتيح والـ ZIP).
- الصلاحيات تُفحص في الخادم وفي قاعدة البيانات (Row Level Security)، ولا يُعتمد على المتصفح.
- لا يُفتح مدفوع إلا بإشعار Paymob موقَّع (HMAC) ثم تحقق المبلغ والعملة والطلب، مرة واحدة فقط.
- قيود وحدود معروفة مذكورة بصراحة في [قائمة الأمان](docs/03-test-and-security-checklist.md).
