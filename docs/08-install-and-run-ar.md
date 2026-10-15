# دليل تثبيت وتشغيل المشروع على جهازك

> لم يُبنَ المشروع ولم يُشغَّل على جهاز بإنترنت بعد. أول تشغيل ناجح هو أول اختبار حقيقي للبناء. إن ظهر خطأ فأرسل نصه كاملاً.

## 1) المتطلبات
| المطلوب | الإصدار | كيف تتأكد |
|---|---|---|
| Node.js | **22.18 أو أحدث** (اختبارات المشروع تعتمد عليه) | `node -v` |
| npm | يأتي مع Node | `npm -v` |
| Git | أي إصدار حديث | `git --version` |
| حساب Supabase مجاني | لتشغيل التسجيل والبيانات | انظر [دليل Supabase](09-supabase-setup-ar.md) |

تثبيت Node: من الموقع الرسمي nodejs.org (نسخة LTS الأحدث بشرط أن تكون 22.18+).

## 2) الخطوات
1. فكّ ضغط الملف، وافتح الطرفية (Terminal / PowerShell) داخل مجلد `washington-academy`.
2. ثبّت الحزم (يحتاج إنترنت، وينشئ ملف `package-lock.json`):
   ```bash
   npm install
   ```
3. أنشئ ملف البيئة:
   ```bash
   cp .env.example .env.local        # على ويندوز PowerShell: Copy-Item .env.example .env.local
   ```
4. افتح `.env.local` واملأ على الأقل:
   `NEXT_PUBLIC_SITE_URL` (اتركه `http://localhost:3000`) و`NEXT_PUBLIC_SUPABASE_URL` و`NEXT_PUBLIC_SUPABASE_ANON_KEY` و`SUPABASE_SERVICE_ROLE_KEY`.
   **لا ترفع `.env.local` إلى GitHub ولا تشاركه مع أحد** (محجوب بـ `.gitignore`).
5. افحص المتغيرات (لا يطبع قيمة واحدة):
   ```bash
   node scripts/check-env.mjs
   ```
6. شغّل الموقع:
   ```bash
   npm run dev
   ```
   ثم افتح http://localhost:3000

## 3) ما يعمل بدون Supabase وما لا يعمل
- بلا مفاتيح Supabase: تُفتح الصفحات العامة بكتالوج فارغ، وصفحات الدخول تعرض «لم يتم ربط الخادم بعد». لا تسجيل ولا دفع.
- بلا Paymob: زر الدفع الإلكتروني يظهر «غير مفعّل» ولا يوجد أي دفع وهمي.
- بلا Cloudflare Stream: الدرس يعرض «الفيديو غير متاح مؤقتاً» وبقية المحتوى يعمل.
- بلا إعداد البريد: لا تُرسل رسائل، وتبقى الإشعارات داخل الموقع.

## 4) الفحوص قبل أي نشر (بالترتيب)
```bash
npm run typecheck     # فحص الأنواع الحقيقي (أول مرة بمكتبات حقيقية)
npm test              # الاختبارات والفحوص الأمنية الآلية
npm run build         # بناء الإنتاج: هذا هو الاختبار الحاسم
npm start             # تشغيل نسخة الإنتاج محلياً على http://localhost:3000
```
**لا تنشر قبل أن ينجح `npm run build`.** أرسل لي ناتجه إن فشل.

## 5) اختبار قاعدة البيانات (SQL)
على **مشروع Supabase تجريبي منفصل** (ليس مشروعك الحقيقي) وبعد تثبيت `psql`:
```bash
DATABASE_URL="postgresql://postgres:كلمة_المرور@db.xxxx.supabase.co:5432/postgres" ./scripts/run-sql-checks.sh --migrate
```
يطبّق الترحيلات ثم يشغّل 8 ملفات اختبار (176 تأكيداً)، وكل ملف داخل معاملة تُلغى. تظهر عبارات `PASS` لكل مجموعة. ثقة هذه الاختبارات صفر حتى تُشغَّل فعلاً: أي خطأ فيها يستحق أن يُرسل لي.

## 6) اختبارات المتصفح (اختياري بعد التشغيل)
```bash
npx playwright install chromium
E2E_BASE_URL=http://localhost:3000 npm run test:e2e     # PowerShell: $env:E2E_BASE_URL="http://localhost:3000"; npm run test:e2e
```
لاختبار «الطالب لا يفتح لوحة الإدارة» أضف `E2E_STUDENT_EMAIL` و`E2E_STUDENT_PASSWORD` لحساب **طالب تجريبي** (لا تستخدم حساباً حقيقياً).

## 7) مشاكل شائعة
| العرض | السبب والحل |
|---|---|
| `npm test` يفشل بخطأ عن `.ts` | نسخة Node أقدم من 22.18: حدّثها |
| `Module not found` عند البناء | احذف `node_modules` و`package-lock.json` ثم `npm install` مجدداً وأرسل لي النص إن تكرر |
| الصفحة بلا خطوط عربية | البناء يحمّل الخطوط من Google؛ يحتاج إنترنت أثناء `build` |
| «لم يتم ربط الخادم بعد» | متغيرات Supabase غير مضبوطة أو أُعيد تشغيل `npm run dev` قبل حفظ `.env.local` |
| تسجيل الدخول يفشل رغم صحة البيانات | تأكد من تفعيل البريد (Confirm email) أو من رابط Redirect في Supabase |
