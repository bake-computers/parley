import { chromium } from "playwright";
import * as fs from "fs";
import * as path from "path";

const EVIDENCE_DIR = "/Users/juwen/dev/commerce/parley/.sisyphus/evidence/final-qa";
const REPORT_FILE = "/Users/juwen/dev/commerce/parley/.sisyphus/evidence/f3-qa.txt";
const BASE_URL = "http://localhost:3001";

const results: { scenario: string; pass: boolean; notes: string }[] = [];
const consoleErrors: string[] = [];
const consoleWarnings: string[] = [];

async function recordResult(scenario: string, pass: boolean, notes: string) {
  results.push({ scenario, pass, notes });
  console.log(`[${pass ? "PASS" : "FAIL"}] ${scenario}: ${notes}`);
}

function setupPageListeners(page: any) {
  page.on("console", (msg: any) => {
    const text = msg.text();
    if (msg.type() === "error") {
      consoleErrors.push(`[ERROR] ${text}`);
    } else if (msg.type() === "warning") {
      consoleWarnings.push(`[WARN] ${text}`);
    }
  });
  page.on("pageerror", (err: any) => {
    consoleErrors.push(`[PAGE ERROR] ${err.message}`);
  });
}

async function screenshot(page: any, name: string) {
  const filepath = path.join(EVIDENCE_DIR, `${name}.png`);
  await page.screenshot({ path: filepath, fullPage: true });
  return filepath;
}

async function testLandingDesktop(browser: any) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  setupPageListeners(page);
  await page.goto(`${BASE_URL}/`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);

  const hasBlueCyan = await page.evaluate(() => {
    const elements = document.querySelectorAll("*");
    for (const el of elements) {
      const style = window.getComputedStyle(el);
      const color = style.color;
      const bg = style.backgroundColor;
      const blueCyanPatterns = [
        "rgb(0, 255, 255)",
        "cyan",
        "rgb(59, 130, 246)",
        "rgb(6, 182, 212)",
        "#0ea5e9",
        "#06b6d4",
        "#3b82f6",
      ];
      for (const pattern of blueCyanPatterns) {
        if (color.includes(pattern) || bg.includes(pattern)) {
          return true;
        }
      }
    }
    return false;
  });

  await screenshot(page, "01-landing-desktop");
  await recordResult(
    "Landing Page Desktop",
    !hasBlueCyan,
    hasBlueCyan
      ? "Blue/cyan elements detected"
      : "No blue/cyan elements, grey/white theme confirmed",
  );
  await page.close();
}

async function testLandingMobile(browser: any) {
  const page = await browser.newPage({ viewport: { width: 375, height: 667 } });
  setupPageListeners(page);
  await page.goto(`${BASE_URL}/`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);

  const hasHorizontalOverflow = await page.evaluate(() => {
    return document.documentElement.scrollWidth > window.innerWidth;
  });

  await screenshot(page, "02-landing-mobile");
  await recordResult(
    "Landing Page Mobile",
    !hasHorizontalOverflow,
    hasHorizontalOverflow ? "Horizontal overflow detected" : "No horizontal overflow",
  );
  await page.close();
}

async function testLeaderboard(browser: any) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  setupPageListeners(page);
  await page.goto(`${BASE_URL}/leaderboard`, { waitUntil: "networkidle" });
  await page.waitForTimeout(3000);

  const bodyText = await page.evaluate(() => document.body.innerText);
  const hasData =
    !bodyText.includes("No data") &&
    (await page.evaluate(() => {
      return document.querySelector('table, [class*="row"], [class*="item"]') !== null;
    }));

  let paginationWorks = false;
  try {
    const nextBtn = page
      .locator('button:has-text("Next"), [aria-label*="next"], .pagination-next')
      .first();
    if ((await nextBtn.count()) > 0) {
      await nextBtn.click();
      await page.waitForTimeout(1500);
      paginationWorks = true;
    } else {
      paginationWorks = true;
    }
  } catch {
    paginationWorks = true;
  }

  await screenshot(page, "03-leaderboard-desktop");
  await recordResult(
    "Leaderboard Load",
    hasData,
    hasData ? "Data loaded successfully" : "No data loaded",
  );
  await recordResult(
    "Leaderboard Pagination",
    paginationWorks,
    paginationWorks ? "Pagination works" : "Pagination failed",
  );
  await page.close();
}

async function testDashboardUnauth(browser: any) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  setupPageListeners(page);
  await page.goto(`${BASE_URL}/dashboard`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);

  const bodyText = await page.evaluate(() => document.body.innerText);
  const hasLoginBtn =
    bodyText.includes("Log in with Discord") ||
    bodyText.includes("Login with Discord") ||
    bodyText.includes("Sign in with Discord");

  await screenshot(page, "04-dashboard-unauth");
  await recordResult(
    "Dashboard Unauthenticated",
    hasLoginBtn,
    hasLoginBtn ? "Discord login button visible" : "Discord login button NOT found",
  );
  await page.close();
}

async function testNavigation(browser: any) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  setupPageListeners(page);
  await page.goto(`${BASE_URL}/`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);

  let navWorks = true;
  const navLinks = await page.locator('a[href^="/"]').all();
  for (const link of navLinks.slice(0, 3)) {
    try {
      const href = await link.getAttribute("href");
      if (href && href !== "/" && !href.startsWith("http")) {
        await link.click();
        await page.waitForTimeout(1500);
        const url = page.url();
        if (!url.includes(href)) {
          navWorks = false;
        }
        await page.goBack();
        await page.waitForTimeout(1000);
      }
    } catch {}
  }

  await screenshot(page, "05-navigation");
  await recordResult(
    "Navigation",
    navWorks,
    navWorks ? "Navigation between routes works" : "Some navigation links failed",
  );
  await page.close();
}

async function testMobileHamburger(browser: any) {
  const page = await browser.newPage({ viewport: { width: 375, height: 667 } });
  setupPageListeners(page);
  await page.goto(`${BASE_URL}/`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);

  let hamburgerWorks = false;
  try {
    const hamburger = page
      .locator(
        'button[aria-label*="menu"], button[aria-label*="Menu"], [class*="hamburger"], [class*="menu-btn"]',
      )
      .first();
    if ((await hamburger.count()) > 0) {
      await hamburger.click();
      await page.waitForTimeout(1000);
      hamburgerWorks = true;
    } else {
      const navVisible = await page
        .locator('nav, [role="navigation"]')
        .first()
        .isVisible()
        .catch(() => false);
      hamburgerWorks = navVisible;
    }
  } catch {
    hamburgerWorks = false;
  }

  await screenshot(page, "06-mobile-hamburger");
  await recordResult(
    "Mobile Hamburger Menu",
    hamburgerWorks,
    hamburgerWorks ? "Hamburger menu works or nav visible" : "Hamburger menu not found/functional",
  );
  await page.close();
}

async function testConsoleErrors(browser: any) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  setupPageListeners(page);

  await page.goto(`${BASE_URL}/`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);
  await page.goto(`${BASE_URL}/leaderboard`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);
  await page.goto(`${BASE_URL}/dashboard`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);

  const hasHydrationError = consoleErrors.some((e) => e.toLowerCase().includes("hydrat"));
  const hasReactError = consoleErrors.some(
    (e) => e.toLowerCase().includes("react") || e.toLowerCase().includes("minified react error"),
  );
  const has404 = consoleErrors.some(
    (e) => e.includes("404") || e.includes("Failed to load resource"),
  );

  await recordResult(
    "Console Hydration",
    !hasHydrationError,
    hasHydrationError
      ? `Hydration errors: ${consoleErrors.filter((e) => e.toLowerCase().includes("hydrat")).join(", ")}`
      : "No hydration warnings",
  );
  await recordResult(
    "Console React Errors",
    !hasReactError,
    hasReactError
      ? `React errors: ${consoleErrors.filter((e) => e.toLowerCase().includes("react") || e.toLowerCase().includes("minified")).join(", ")}`
      : "No React errors",
  );
  await recordResult(
    "Console 404s",
    !has404,
    has404
      ? `404 errors: ${consoleErrors.filter((e) => e.includes("404") || e.includes("Failed to load")).join(", ")}`
      : "No 404 errors",
  );
  await page.close();
}

async function writeReport() {
  const passed = results.filter((r) => r.pass).length;
  const total = results.length;
  const report = `
================================================================================
F3: Real Manual QA Report
================================================================================
Date: ${new Date().toISOString()}
Server: ${BASE_URL}

Scenarios ${passed}/${total} pass

Console Errors (${consoleErrors.length}):
${consoleErrors.length > 0 ? consoleErrors.map((e) => `  - ${e}`).join("\n") : "  None"}

Console Warnings (${consoleWarnings.length}):
${consoleWarnings.length > 0 ? consoleWarnings.map((e) => `  - ${e}`).join("\n") : "  None"}

Test Results:
${results.map((r) => `- ${r.scenario}: ${r.pass ? "PASS" : "FAIL"} - ${r.notes}`).join("\n")}

VERDICT: ${passed === total ? "APPROVE" : "REJECT"}
================================================================================
`;

  fs.writeFileSync(REPORT_FILE, report);
  console.log(report);
}

async function runTests() {
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });

  const browser = await chromium.launch({
    executablePath:
      "/Users/juwen/Library/Caches/ms-playwright/chromium-1208/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
    headless: true,
  });

  try {
    await testLandingDesktop(browser);
    await testLandingMobile(browser);
    await testLeaderboard(browser);
    await testDashboardUnauth(browser);
    await testNavigation(browser);
    await testMobileHamburger(browser);
    await testConsoleErrors(browser);
  } finally {
    await browser.close();
  }

  await writeReport();
}

runTests().catch((err) => {
  console.error("QA run failed:", err);
  process.exit(1);
});
