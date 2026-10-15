import type { Lang } from "./i18n";

export const authText = {
  ar: {
    login: "تسجيل الدخول", register: "إنشاء حساب", forgot: "نسيت كلمة المرور؟", reset: "كلمة مرور جديدة",
    name: "الاسم الكامل", email: "البريد الإلكتروني", phone: "رقم الهاتف المحمول", phoneHint: "مثال: 01012345678",
    password: "كلمة المرور", passwordHint: "8 أحرف على الأقل، وتحتوي على حرف ورقم.", newPassword: "كلمة المرور الجديدة",
    sendLink: "أرسل رابط الاستعادة", save: "حفظ", haveAccount: "لديك حساب؟", noAccount: "ليس لديك حساب؟", google: "المتابعة عبر Google", or: "أو",
    notConfigured: "لم يتم ربط الخادم بعد (متغيرات Supabase غير مضبوطة).",
    errors: { name: "أدخل اسمك الكامل.", email: "بريد إلكتروني غير صالح.", phone: "رقم هاتف غير صالح.", password: "كلمة المرور ضعيفة.", invalid: "البريد أو كلمة المرور غير صحيحة.", closed: "التسجيل مغلق حالياً.", rate: "محاولات كثيرة. انتظر بضع دقائق ثم أعد المحاولة.", failed: "تعذّر إكمال العملية. حاول مرة أخرى.", suspended: "هذا الحساب موقوف. تواصل مع الإدارة." },
    notices: { check_email: "أرسلنا رسالة تأكيد إلى بريدك. افتح الرابط لتفعيل الحساب.", reset_sent: "إذا كان البريد مسجلاً، فقد أرسلنا رابط الاستعادة.", password_updated: "تم تغيير كلمة المرور. سجّل الدخول." },
  },
  en: {
    login: "Sign in", register: "Create account", forgot: "Forgot password?", reset: "New password",
    name: "Full name", email: "Email", phone: "Mobile number", phoneHint: "e.g. 01012345678",
    password: "Password", passwordHint: "At least 8 characters, with a letter and a number.", newPassword: "New password",
    sendLink: "Send reset link", save: "Save", haveAccount: "Already have an account?", noAccount: "No account yet?", google: "Continue with Google", or: "or",
    notConfigured: "The server is not connected yet (Supabase variables are not set).",
    errors: { name: "Enter your full name.", email: "Invalid email address.", phone: "Invalid phone number.", password: "Password is too weak.", invalid: "Incorrect email or password.", closed: "Registration is currently closed.", rate: "Too many attempts. Please wait a few minutes and try again.", failed: "Could not complete the request. Please try again.", suspended: "This account is suspended. Contact the administration." },
    notices: { check_email: "We sent a confirmation email. Open the link to activate your account.", reset_sent: "If the email is registered, we sent a reset link.", password_updated: "Password changed. Please sign in." },
  },
} as const;
export const at = (l: Lang) => authText[l];
