import Image from "next/image";
import Link from "next/link";
import { getLang, t } from "@/lib/i18n";
import { categoryLabel, listCategories, listCourses, listInstructors, listTestimonials } from "@/lib/courses";
import CourseCard from "@/components/CourseCard";
import { Icon } from "@/components/Icons";

const benefitIcons = ["user", "card", "play", "file", "cert"];

export default async function Home() {
  const lang = await getLang();
  const d = t(lang);
  const [featured, free, categories, instructors, testimonials] = await Promise.all([listCourses({ sort: "newest" }), listCourses({ free: true }), listCategories(), listInstructors(), listTestimonials()]);
  const popular = [...featured].filter((c) => c.enrollments > 0).sort((a, b) => b.enrollments - a.enrollments).slice(0, 3);
  const contactEmail = process.env.NEXT_PUBLIC_CONTACT_EMAIL;

  return (
    <>
      {/* Hero */}
      <section className="bg-navy-950 text-ivory-50">
        <div className="container-x grid items-center gap-10 py-14 md:grid-cols-[1.3fr_1fr] md:py-20">
          <div>
            <h1 className="text-4xl font-bold text-ivory-50 md:text-5xl">{d.hero.title}</h1>
            <p className="mt-5 max-w-xl text-lg text-ivory-100/80">{d.hero.sub}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/courses" className="btn btn-gold">{d.hero.cta1}</Link>
              <Link href="/courses?free=1" className="btn btn-ghost-light">{d.hero.cta2}</Link>
            </div>
          </div>
          <div className="mx-auto flex aspect-square w-64 items-center justify-center rounded-full border border-gold-500/50 p-3 md:w-80">
            <div className="flex h-full w-full items-center justify-center rounded-full border border-gold-500/20 bg-navy-900">
              <Image src="/brand/logo-gold-mark.png" alt={d.brand} width={240} height={225} priority className="w-3/4" />
            </div>
          </div>
        </div>
      </section>

      {/* Featured */}
      {featured.length > 0 && <section className="container-x py-14">
        <div className="mb-6 flex items-end justify-between">
          <h2 className="text-3xl font-bold text-navy-900">{d.sections.featured}</h2>
          <Link href="/courses" className="text-sm font-semibold text-navy-700 underline underline-offset-4">{d.sections.all}</Link>
        </div>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {featured.slice(0, 3).map((c) => <CourseCard key={c.slug} c={c} lang={lang} />)}
        </div>
      </section>}

      {/* Popular (only courses that really have enrollments) */}
      {popular.length > 0 && (
        <section className="container-x pb-14">
          <h2 className="mb-6 text-3xl font-bold text-navy-900">{d.sections.popular}</h2>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{popular.map((c) => <CourseCard key={c.slug} c={c} lang={lang} />)}</div>
        </section>
      )}

      {/* Categories */}
      {categories.length > 0 && <section className="bg-ivory-200/60 py-14">
        <div className="container-x">
          <h2 className="mb-6 text-3xl font-bold text-navy-900">{d.sections.categories}</h2>
          <ul className="grid gap-x-8 sm:grid-cols-2">
            {categories.map((c) => (
              <li key={c.slug} className="border-b border-navy-900/15">
                <Link href={`/courses?category=${c.slug}`} className="flex items-center justify-between py-4 text-lg hover:text-gold-700">
                  <span>{categoryLabel(c, lang)}</span>
                  <span className="text-sm text-ink/60">{featured.filter((x) => x.categorySlug === c.slug).length}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>}

      {/* Free */}
      {free.length > 0 && (
        <section className="container-x py-14">
          <h2 className="mb-6 text-3xl font-bold text-navy-900">{d.sections.free}</h2>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {free.map((c) => <CourseCard key={c.slug} c={c} lang={lang} />)}
          </div>
        </section>
      )}

      {/* Instructors (only those teaching a published course) */}
      {instructors.length > 0 && (
        <section className="container-x py-14">
          <h2 className="mb-6 text-3xl font-bold text-navy-900">{d.sections.instructors}</h2>
          <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {instructors.map((i) => (
              <li key={i.id} className="rounded-lg border border-ivory-200 bg-ivory-50 p-5">
                <p className="font-display text-xl text-navy-900">{i.name}</p>
                {i.bio && <p className="mt-2 text-sm text-ink/75">{i.bio}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Benefits */}
      <section id="benefits" className="bg-navy-900 py-14 text-ivory-50">
        <div className="container-x">
          <h2 className="mb-8 text-3xl font-bold text-gold-300">{d.sections.benefits}</h2>
          <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-5 lg:gap-0 lg:divide-x lg:divide-gold-500/30 rtl:lg:divide-x-reverse">
            {d.benefits.map((b, i) => (
              <li key={b.t} className="lg:px-5 lg:first:ps-0 lg:last:pe-0">
                <Icon name={benefitIcons[i]} className="mb-3 h-8 w-8 text-gold-400" />
                <p className="font-semibold text-gold-300">{b.t}</p>
                <p className="mt-1 text-sm text-ivory-100/75">{b.d}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Testimonials (written/approved by the administrator; never auto-generated) */}
      {testimonials.length > 0 && (
        <section className="bg-ivory-200/60 py-14">
          <div className="container-x">
            <h2 className="mb-6 text-3xl font-bold text-navy-900">{d.sections.testimonials}</h2>
            <ul className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
              {testimonials.map((t) => (
                <li key={t.id} className="rounded-lg border border-navy-900/10 bg-ivory-50 p-5">
                  <p className="whitespace-pre-line text-ink/85">{t.body}</p>
                  <p className="mt-3 text-sm font-semibold text-navy-900">{t.author}{t.course && <span className="font-normal text-ink/60"> — {t.course}</span>}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {/* FAQ */}
      <section id="faq" className="container-x max-w-3xl py-14">
        <h2 className="mb-6 text-3xl font-bold text-navy-900">{d.sections.faq}</h2>
        <div className="divide-y divide-navy-900/15 border-y border-navy-900/15">
          {d.faq.map((f) => (
            <details key={f.q} className="group py-4">
              <summary className="flex min-h-[44px] cursor-pointer list-none items-center justify-between gap-4 font-semibold text-navy-900">
                {f.q}
                <span className="text-gold-600 transition-transform group-open:rotate-45" aria-hidden="true">+</span>
              </summary>
              <p className="mt-2 text-ink/80">{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* Contact */}
      <section id="contact" className="border-t border-ivory-200 bg-ivory-50 py-14">
        <div className="container-x max-w-3xl">
          <h2 className="text-3xl font-bold text-navy-900">{d.sections.contact}</h2>
          <p className="mt-3 text-ink/80">{d.contactText}</p>
          {contactEmail && <a href={`mailto:${contactEmail}`} className="btn btn-navy mt-5">{contactEmail}</a>}
        </div>
      </section>
    </>
  );
}
