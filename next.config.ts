import type { NextConfig } from "next";

/**
 * Content-Security-Policy — v1.8 hardening (continues the v1.7.2 audit).
 * Next.js requires 'unsafe-inline'/'unsafe-eval' for its hydration bootstrap
 * and dev overlay; everything else is locked to 'self'.
 *
 * v1.8.1: no `frame-ancestors` / `X-Frame-Options`. The dashboard is a
 * first-class embed (chat sidebars, IDE panels, preview gateways) and the
 * app holds no cookies — auth is PAT via explicit Authorization headers,
 * which browsers never attach cross-site. With no ambient credentials a
 * clickjacking frame has nothing to hijack, so framing stays open while
 * every other directive remains locked to 'self'.
 */
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "manifest-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  "upgrade-insecure-requests",
].join("; ");

const nextConfig: NextConfig = {
  // v1.8.3: standalone ONLY for the Docker image (NEXT_OUTPUT_MODE=standalone in
  // the Dockerfile). On Vercel the standalone output made the builder skip the
  // normal file trace — Prisma's libquery_engine-*.so.node never reached the
  // .func bundles and every DB-backed request 500'd with an empty body.
  output: process.env.NEXT_OUTPUT_MODE === "standalone" ? "standalone" : undefined,
  reactStrictMode: false,
  // v1.8.3: force Prisma's query-engine binaries + generated client into every
  // serverless bundle (belt-and-suspenders on top of the default externals).
  outputFileTracingIncludes: {
    "/api/**/*": ["./node_modules/.prisma/client/**", "./node_modules/@prisma/client/**", "./db/vercel-bootstrap.db"],
    "/**/*": ["./node_modules/.prisma/client/**", "./node_modules/@prisma/client/**", "./db/vercel-bootstrap.db"],
  },
  // v1.8: build fails on type errors (src/ verified clean via tsc --noEmit;
  // sandbox-only skills/ folder is excluded in tsconfig)
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
