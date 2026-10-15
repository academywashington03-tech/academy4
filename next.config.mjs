const isProd = process.env.NODE_ENV === "production";
const enforce = process.env.CSP_ENFORCE === "1";

// Content-Security-Policy. Next.js needs inline scripts for hydration (no nonce), so script-src keeps 'unsafe-inline';
// the policy still blocks every external script/frame/connection that is not listed below.
// form-action also lists Paymob: without JavaScript the checkout form is submitted natively and the server answers with a redirect to Paymob,
// which Chrome checks against form-action once the policy is enforced.
// It ships in REPORT-ONLY mode: open the site, check the browser console for violations, then set CSP_ENFORCE=1.
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'" + (isProd ? "" : " 'unsafe-eval'"),
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.supabase.co",
  "font-src 'self' data:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
  "frame-src https://*.cloudflarestream.com https://www.youtube-nocookie.com https://accept.paymob.com",
  "media-src 'self' https://*.supabase.co https://*.cloudflarestream.com",
  "object-src 'none'", "base-uri 'self'", "frame-ancestors 'self'", "form-action 'self' https://accept.paymob.com",
].join("; ");

/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  // Linting is its own step (`npm run lint`, also in CI) so a style rule can never block a production build.
  eslint: { ignoreDuringBuilds: true },
  async headers() {
    return [{
      source: "/(.*)",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "SAMEORIGIN" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(self)" },
        { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
        ...(isProd ? [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }] : []),
        { key: enforce ? "Content-Security-Policy" : "Content-Security-Policy-Report-Only", value: csp },
      ],
    }];
  },
};
export default nextConfig;
