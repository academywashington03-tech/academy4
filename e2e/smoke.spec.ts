import { test, expect } from "@playwright/test";

const PUBLIC = ["/", "/courses", "/login", "/register", "/policy/privacy"];

test.describe("public site", () => {
  test("Arabic RTL by default", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.locator("html")).toHaveAttribute("lang", "ar");
    await expect(page).toHaveTitle(/واشنطن/);
  });
  for (const path of PUBLIC) {
    test(`no horizontal scrolling: ${path}`, async ({ page }) => {      // TEST 17 (mobile + desktop projects)
      await page.goto(path);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(1);
    });
  }
  test("security headers", async ({ request }) => {
    const r = await request.get("/");
    expect(r.headers()["x-content-type-options"]).toBe("nosniff");
    expect(r.headers()["x-frame-options"]).toBe("SAMEORIGIN");
  });
  test("robots.txt hides private areas", async ({ request }) => {
    const t = await (await request.get("/robots.txt")).text();
    expect(t).toContain("Disallow: /admin");
    expect(t).toContain("Disallow: /dashboard");
  });
});

test.describe("access control", () => {
  for (const path of ["/admin", "/admin/courses", "/dashboard", "/learn/x/y", "/orders", "/certificates"]) {
    test(`anonymous is redirected to login: ${path}`, async ({ page }) => {   // TEST 2 (anonymous side)
      await page.goto(path);
      await expect(page).toHaveURL(/\/login/);
    });
  }
  test("unsigned payment webhook is rejected", async ({ request }) => {      // TEST 8
    const r = await request.post("/api/webhooks/paymob", { data: { type: "TRANSACTION", obj: { id: 1, success: true, amount_cents: 100, currency: "EGP", order: { id: 1, merchant_order_id: "00000000-0000-0000-0000-000000000000" } } } });
    expect([401, 503]).toContain(r.status());
  });
  test("resource download requires login", async ({ page }) => {
    await page.goto("/api/resources/00000000-0000-0000-0000-000000000000");
    await expect(page).toHaveURL(/\/login/);
  });
  test("unknown certificate number is not verified", async ({ page }) => {   // TEST 15 (negative case)
    await page.goto("/verify/WA-2026-0000-0000-0000");
    await expect(page.getByText("لم نجد شهادة")).toBeVisible();
  });
  test("student cannot open admin pages", async ({ page }) => {             // TEST 2
    const email = process.env.E2E_STUDENT_EMAIL, password = process.env.E2E_STUDENT_PASSWORD;
    test.skip(!email || !password, "set E2E_STUDENT_EMAIL / E2E_STUDENT_PASSWORD (a STUDENT test account)");
    await page.goto("/login");
    await page.fill('input[name="email"]', email!); await page.fill('input[name="password"]', password!);
    await page.click("button.btn-navy");
    await expect(page).toHaveURL(/\/dashboard/);
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/forbidden/);
    await page.goto("/admin/orders");
    await expect(page).toHaveURL(/\/forbidden/);
  });
});
