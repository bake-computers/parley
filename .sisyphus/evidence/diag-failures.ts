import { chromium } from 'playwright';

const BASE_URL = 'http://localhost:3001';
const failedUrls: string[] = [];

async function run() {
  const browser = await chromium.launch({
    executablePath: '/Users/juwen/Library/Caches/ms-playwright/chromium-1208/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
    headless: true,
  });

  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

  page.on('response', response => {
    if (response.status() >= 400) {
      console.log(`[HTTP ${response.status()}] ${response.url()}`);
    }
  });

  page.on('requestfailed', request => {
    const url = request.url();
    if (!failedUrls.includes(url)) {
      failedUrls.push(url);
      console.log(`[FAILED] ${url} - ${request.failure()?.errorText}`);
    }
  });

  await page.goto(`${BASE_URL}/leaderboard`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);
  await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);

  console.log('\n--- Unique Failed URLs ---');
  for (const url of failedUrls) {
    console.log(url);
  }

  await browser.close();
}

run().catch(console.error);
