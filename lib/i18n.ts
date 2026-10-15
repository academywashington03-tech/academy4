import { cookies } from "next/headers";

export type Lang = "ar" | "en";
export const dirOf = (l: Lang) => (l === "ar" ? "rtl" : "ltr");

export async function getLang(): Promise<Lang> {
  const c = (await cookies()).get("lang")?.value;
  return c === "en" ? "en" : "ar"; // Arabic is the default
}

export const dict = {
  ar: {
    brand: "أكاديمية واشنطن", tagline: "تعلّم اليوم… وابنِ مستقبلك",
    nav: { home: "الرئيسية", courses: "الدورات", benefits: "المزايا", faq: "الأسئلة الشائعة", contact: "تواصل معنا", login: "تسجيل الدخول", register: "إنشاء حساب", menu: "القائمة" },
    hero: { title: "تعليم إلكتروني بمستوى أكاديمي رفيع", sub: "دورات منظّمة، ومحاضرات وملفات PDF، واختبارات، وشهادات إتمام — كل ذلك من هاتفك أو حاسوبك.", cta1: "استعرض الدورات", cta2: "ابدأ مجاناً" },
    sections: { featured: "دورات مميزة", categories: "التصنيفات", popular: "الأكثر طلباً", free: "دورات مجانية", benefits: "لماذا أكاديمية واشنطن؟", instructors: "المحاضرون", testimonials: "آراء الطلاب", faq: "الأسئلة الشائعة", contact: "تواصل معنا", all: "عرض الكل" },
    benefits: [
      { t: "تسجيل سهل وآمن", d: "أنشئ حسابك في دقيقة واحدة بالبريد الإلكتروني ورقم الهاتف." },
      { t: "دفع إلكتروني آمن", d: "لا نخزّن بيانات البطاقات، ويُفعَّل اشتراكك بعد تأكيد الدفع من الخادم." },
      { t: "كورسات متنوعة", d: "مجالات متعددة بمستويات مختلفة، مجانية ومدفوعة." },
      { t: "محاضرات وملفات", d: "فيديوهات وملفات PDF ومواد مساندة في مكان واحد." },
      { t: "شهادات إتمام", d: "شهادة إتمام برقم فريد وصفحة تحقق عند استيفاء شروط الدورة." },
    ],
    faq: [
      { q: "كيف أسجّل في دورة؟", a: "أنشئ حساباً، اختر الدورة، ثم أكمل الدفع أو سجّل في الدورة المجانية مباشرة." },
      { q: "متى تُفتح الدورة بعد الدفع؟", a: "في الدفع الإلكتروني تُفتح تلقائياً بعد تأكيد العملية من مزوّد الدفع. في الدفع اليدوي تُفتح بعد مراجعة الإدارة واعتماد الطلب." },
      { q: "هل أستطيع التعلّم من الهاتف؟", a: "نعم، المنصة مصمّمة للهواتف أولاً وتعمل على الحاسوب واللوحي." },
      { q: "هل الشهادات معتمدة رسمياً؟", a: "الشهادات هي شهادات إتمام صادرة عن الأكاديمية، ولا تُعدّ اعتماداً حكومياً أو جامعياً." },
    ],
    course: { free: "مجاني", level: "المستوى", hours: "ساعة", lessons: "درس", by: "المحاضر", search: "ابحث عن دورة…", sort: "الترتيب", newest: "الأحدث", priceAsc: "السعر: الأقل", priceDesc: "السعر: الأعلى", allCats: "كل التصنيفات", apply: "تطبيق", none: "لا توجد دورات مطابقة. جرّب تغيير البحث.", contents: "محتوى الدورة", about: "عن الدورة", goals: "ماذا ستتعلم", prereq: "المتطلبات", back: "كل الدورات" },
    levels: { beginner: "مبتدئ", intermediate: "متوسط", advanced: "متقدم" },
    footer: { policies: "السياسات", privacy: "سياسة الخصوصية", terms: "الشروط والأحكام", refund: "سياسة الاسترداد", rights: "جميع الحقوق محفوظة", switch: "English" },
    contactText: "للاستفسار عن الدورات أو الدفع، تواصل معنا وسنرد عليك في أقرب وقت.",
  },
  en: {
    brand: "Washington Academy", tagline: "Learn Today… Build Your Future",
    nav: { home: "Home", courses: "Courses", benefits: "Benefits", faq: "FAQ", contact: "Contact", login: "Sign in", register: "Create account", menu: "Menu" },
    hero: { title: "Online learning, held to an academic standard", sub: "Structured courses, lectures and PDF materials, quizzes and completion certificates — from your phone or computer.", cta1: "Browse courses", cta2: "Start free" },
    sections: { featured: "Featured courses", categories: "Categories", popular: "Most popular", free: "Free courses", benefits: "Why Washington Academy?", instructors: "Instructors", testimonials: "Student feedback", faq: "Frequently asked questions", contact: "Contact us", all: "View all" },
    benefits: [
      { t: "Easy, secure sign-up", d: "Create your account in a minute with email and phone number." },
      { t: "Secure online payment", d: "We never store card data, and access is activated only after the server confirms payment." },
      { t: "Varied courses", d: "Several fields and levels, free and paid." },
      { t: "Lectures and files", d: "Videos, PDFs and supporting materials in one place." },
      { t: "Completion certificates", d: "A certificate with a unique number and verification page once course requirements are met." },
    ],
    faq: [
      { q: "How do I enroll?", a: "Create an account, choose a course, then pay or enroll directly in a free course." },
      { q: "When does the course open after payment?", a: "Online payments activate automatically once the provider's confirmation is verified. Manual payments activate after an administrator approves the order." },
      { q: "Can I learn on my phone?", a: "Yes. The platform is mobile-first and also works on tablets and computers." },
      { q: "Are certificates officially accredited?", a: "They are completion certificates issued by the Academy and are not government or university accreditation." },
    ],
    course: { free: "Free", level: "Level", hours: "hrs", lessons: "lessons", by: "Instructor", search: "Search courses…", sort: "Sort", newest: "Newest", priceAsc: "Price: low to high", priceDesc: "Price: high to low", allCats: "All categories", apply: "Apply", none: "No matching courses. Try a different search.", contents: "Course contents", about: "About this course", goals: "What you will learn", prereq: "Prerequisites", back: "All courses" },
    levels: { beginner: "Beginner", intermediate: "Intermediate", advanced: "Advanced" },
    footer: { policies: "Policies", privacy: "Privacy policy", terms: "Terms", refund: "Refund policy", rights: "All rights reserved", switch: "العربية" },
    contactText: "Questions about courses or payment? Get in touch and we will reply as soon as possible.",
  },
} as const;

export const t = (l: Lang) => dict[l];

export function formatMoney(minor: number, l: Lang, currency = "EGP") {
  return new Intl.NumberFormat(l === "ar" ? "ar-EG" : "en-EG", { style: "currency", currency, maximumFractionDigits: 0 }).format(minor / 100);
}
