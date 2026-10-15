// Self-contained certificate (own CSS) so it looks identical on screen and when saved as PDF from the browser.
// Sizes use container-query units (cqw) so it scales on phones and prints at A4 landscape.
type Props = {
  studentName: string; courseTitle: string; issuedAt: string; certNo: string; instructorName?: string | null;
  signatoryName?: string | null; signatoryTitle?: string | null; qrSvg: string; verifyUrl: string; sealSrc: string;
};

const css = `
.cert-wrap{container-type:inline-size;width:100%;max-width:1123px;margin:0 auto}
.cert-wrap,.cert-wrap *{box-sizing:border-box}
.cert{position:relative;aspect-ratio:297/210;background:#fdfbf6;color:#0d1b3e;border:1.1cqw solid #0d1b3e;direction:rtl;font-family:var(--font-body),system-ui,sans-serif;overflow:hidden}
.cert::before{content:"";position:absolute;inset:1.2cqw;border:.25cqw solid #d4a53f;pointer-events:none}
.cert-in{position:absolute;inset:2.4cqw 6cqw 3.6cqw;display:flex;flex-direction:column;align-items:center;text-align:center}
.cert-seal{width:8cqw;height:8cqw;object-fit:contain}
.cert-brand{font-family:var(--font-display),serif;font-size:2.8cqw;line-height:1.25;margin-top:.3cqw}
.cert-en{font-size:1.15cqw;letter-spacing:.5cqw;color:#8f6a1e;margin-top:.2cqw;direction:ltr}
.cert-title{font-family:var(--font-display),serif;font-size:4.6cqw;line-height:1.25;margin-top:1cqw;color:#0d1b3e}
.cert-sub{font-size:1.4cqw;letter-spacing:.35cqw;color:#8f6a1e;direction:ltr}
.cert-lead{font-size:1.8cqw;line-height:1.4;margin-top:1.2cqw;color:#1a2238}
.cert-name{font-family:var(--font-display),serif;font-size:4.4cqw;line-height:1.3;margin-top:.3cqw;padding:0 3cqw .2cqw;border-bottom:.25cqw solid #d4a53f;max-width:100%}
.cert-for{font-size:1.8cqw;line-height:1.4;margin-top:1cqw;color:#1a2238}
.cert-course{font-family:var(--font-display),serif;font-size:3cqw;line-height:1.3;margin-top:.2cqw;max-width:100%}
.cert-foot{margin-top:auto;width:100%;display:grid;grid-template-columns:1fr 1fr 1fr;align-items:end;gap:2cqw;font-size:1.25cqw;line-height:1.6}
.cert-foot b{display:block;font-size:1.35cqw}
.cert-qr{width:8cqw;height:8cqw;margin:0 auto}.cert-qr svg{width:100%;height:100%;display:block}
.cert-no{direction:ltr;font-family:ui-monospace,monospace;font-size:1.3cqw;letter-spacing:.1cqw}
.cert-note{font-size:.95cqw;line-height:1.4;color:#5b6478;margin-top:.5cqw}
.cert-sig{border-top:.15cqw solid #0d1b3e;padding-top:.5cqw;margin:0 3cqw}
@media print{@page{size:A4 landscape;margin:0}html,body{background:#fff!important;margin:0!important;padding:0!important;height:210mm;overflow:hidden}header,footer,.no-print{display:none!important}main{padding:0!important}.cert-wrap{max-width:none;width:297mm}.cert{width:297mm;height:210mm;aspect-ratio:auto;page-break-inside:avoid;break-inside:avoid;-webkit-print-color-adjust:exact;print-color-adjust:exact}}
`;

export default function CertificateSheet(p: Props) {
  const date = new Date(p.issuedAt).toLocaleDateString("ar-EG", { year: "numeric", month: "long", day: "numeric" });
  return (
    <div className="cert-wrap">
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <section className="cert" aria-label="شهادة إتمام">
        <div className="cert-in">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="cert-seal" src={p.sealSrc} alt="" />
          <div className="cert-brand">أكاديمية واشنطن</div>
          <div className="cert-en">WASHINGTON ACADEMY</div>
          <h1 className="cert-title">شهادة إتمام</h1>
          <div className="cert-sub">CERTIFICATE OF COMPLETION</div>
          <p className="cert-lead">تُمنح هذه الشهادة إلى</p>
          <p className="cert-name">{p.studentName}</p>
          <p className="cert-for">لإتمام متطلبات دورة</p>
          <p className="cert-course">{p.courseTitle}</p>
          <div className="cert-foot">
            <div><div className="cert-qr" dangerouslySetInnerHTML={{ __html: p.qrSvg }} /><p className="cert-note" style={{ textAlign: "center" }}>امسح الرمز للتحقق من الشهادة</p></div>
            <div><b>{date}</b>تاريخ الإصدار<div className="cert-no" style={{ marginTop: ".5cqw" }}>{p.certNo}</div></div>
            <div>
              {(p.signatoryName || p.instructorName) && <div className="cert-sig"><b>{p.signatoryName || p.instructorName}</b>{p.signatoryName ? p.signatoryTitle : "المحاضر"}</div>}
            </div>
          </div>
          <p className="cert-note" dir="ltr">{p.verifyUrl}</p>
        </div>
      </section>
    </div>
  );
}
