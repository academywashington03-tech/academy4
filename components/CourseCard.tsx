import Link from "next/link";
import { Course, priceOf } from "@/lib/courses";
import { Lang, formatMoney, t } from "@/lib/i18n";
import { Icon } from "./Icons";

export default function CourseCard({ c, lang }: { c: Course; lang: Lang }) {
  const d = t(lang);
  return (
    <Link href={`/courses/${c.slug}`} className="group flex flex-col overflow-hidden rounded-lg border border-ivory-200 bg-ivory-50 transition-colors hover:border-gold-500">
      <div className="relative flex aspect-[16/9] items-end bg-navy-900 p-4"
        style={c.coverUrl ? { backgroundImage: `linear-gradient(to top, rgba(10,21,48,.9), rgba(10,21,48,.15)), url(${encodeURI(c.coverUrl)})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}>
        {!c.coverUrl && <Icon name="book" className="absolute end-4 top-4 h-10 w-10 text-gold-500/40" />}
        <span className="relative font-display text-lg leading-snug text-gold-300">{c.title}</span>
      </div>
      <div className="flex flex-1 flex-col gap-3 p-4">
        {c.short && <p className="text-sm text-ink/75">{c.short}</p>}
        <p className="flex items-center gap-4 text-xs text-ink/60">
          {c.hours !== null && <span className="inline-flex items-center gap-1"><Icon name="clock" className="h-4 w-4" />{c.hours} {d.course.hours}</span>}
          <span>{c.lessons} {d.course.lessons}</span>
          <span>{d.levels[c.level]}</span>
        </p>
        <p className="mt-auto flex items-baseline gap-2 pt-1">
          {c.isFree ? <span className="font-semibold text-navy-700">{d.course.free}</span> : (
            <>
              <span className="font-semibold text-navy-900">{formatMoney(priceOf(c), lang)}</span>
              {c.promoMinor ? <s className="text-xs text-ink/50">{formatMoney(c.priceMinor, lang)}</s> : null}
            </>
          )}
        </p>
      </div>
    </Link>
  );
}
