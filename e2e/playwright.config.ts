import { defineConfig, devices } from "@playwright/test";

// Run against a running site:  E2E_BASE_URL=https://your-preview.vercel.app npm run test:e2e
// Optional logins (test accounts only): E2E_STUDENT_EMAIL / E2E_STUDENT_PASSWORD
export default defineConfig({
  testDir: ".", timeout: 30_000, retries: 1, reporter: [["list"]],
  use: { baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000", locale: "ar-EG" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "android", use: { ...devices["Pixel 7"] } },
    { name: "iphone", use: { ...devices["iPhone 14"] } },
  ],
});
