import puppeteer from 'puppeteer-core';

const CHROMIUM_PATH = '/usr/bin/chromium-browser';

async function fetchHDProduct(url) {
  const browser = await puppeteer.launch({
    executablePath: CHROMIUM_PATH,
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--no-first-run',
      '--no-zygote',
      '--single-process',
    ],
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'
    );

    console.log('Navigating to:', url);
    // Set viewport to look like a real browser
    await page.setViewport({ width: 1280, height: 800 });

    // Set extra headers
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    });

    await page.goto(url, { waitUntil: 'networkidle2', timeout: 45000 });

    // Wait for product data to load
    await new Promise(r => setTimeout(r, 5000));
    console.log('Page title after wait:', await page.title());

    // Extract product data from the page
    const productData = await page.evaluate(() => {
      // Try to get data from meta tags first
      const ogTitle = document.querySelector('meta[property="og:title"]')?.content;
      const ogImage = document.querySelector('meta[property="og:image"]')?.content;

      // Try JSON-LD structured data
      const jsonLdScripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
      let jsonLdData = null;
      for (const script of jsonLdScripts) {
        try {
          const parsed = JSON.parse(script.textContent);
          if (parsed['@type'] === 'Product' || parsed.name) {
            jsonLdData = parsed;
            break;
          }
        } catch (e) {}
      }

      // Try to get price from the page
      const priceEl = document.querySelector('[data-testid="price-format-dollars"]') ||
                      document.querySelector('.price-format__main-price') ||
                      document.querySelector('[class*="price"]');

      // Try to get model number
      const modelEl = document.querySelector('[data-testid="model-number"]') ||
                      document.querySelector('[class*="model-number"]');

      return {
        ogTitle,
        ogImage,
        jsonLdData: jsonLdData ? JSON.stringify(jsonLdData).substring(0, 500) : null,
        priceText: priceEl?.textContent?.trim(),
        modelText: modelEl?.textContent?.trim(),
        pageTitle: document.title,
        url: window.location.href,
      };
    });

    console.log('Product data:', JSON.stringify(productData, null, 2));
    return productData;
  } finally {
    await browser.close();
  }
}

// Test with a known HD product URL
const testUrl = 'https://www.homedepot.com/p/MSI-Calacatta-Gold-12-in-x-24-in-Polished-Porcelain-Stone-Look-Floor-and-Wall-Tile-16-sq-ft-case-NCALGOL1224P/308816217';
fetchHDProduct(testUrl).catch(console.error);
