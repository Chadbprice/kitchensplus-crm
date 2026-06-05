/**
 * productScraper.ts
 *
 * Server-side product metadata extraction for the Proposal Product Importer.
 *
 * Strategy (in order):
 *   1. Home Depot fast path — extract item number from URL, try HD's internal
 *      product summary endpoint. If that fails, return a graceful partial object.
 *   2. JSON-LD extraction — parse <script type="application/ld+json"> Product schema.
 *      Supports direct Product and @graph arrays.
 *   3. OpenGraph / meta tag fallback.
 *   4. Improved price regex fallbacks.
 */

export interface ScrapedProduct {
  title: string;
  imageUrl: string;
  price: number | null;
  description: string;
  sourceUrl: string;
  /** true when price could not be determined automatically */
  priceUnconfirmed?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Browser-like fetch headers to pass Akamai / Cloudflare WAF checks
// ─────────────────────────────────────────────────────────────────────────────
const BROWSER_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept":
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Accept-Encoding": "gzip, deflate, br",
  "Cache-Control": "no-cache",
  "Pragma": "no-cache",
  "Upgrade-Insecure-Requests": "1",
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "none",
  "Sec-Fetch-User": "?1",
  "Sec-Ch-Ua": '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
  "Sec-Ch-Ua-Mobile": "?0",
  "Sec-Ch-Ua-Platform": '"Windows"',
};

// ─────────────────────────────────────────────────────────────────────────────
// JSON-LD extraction
// ─────────────────────────────────────────────────────────────────────────────
interface JsonLdProduct {
  title: string;
  imageUrl: string;
  price: number | null;
  description: string;
}

function extractFromJsonLd(html: string): JsonLdProduct | null {
  // Find all <script type="application/ld+json"> blocks
  const scriptRe = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;

  while ((match = scriptRe.exec(html)) !== null) {
    try {
      const raw = match[1].trim();
      const data = JSON.parse(raw);

      // Collect candidate Product nodes
      const candidates: any[] = [];
      if (Array.isArray(data)) {
        candidates.push(...data);
      } else if (data["@graph"] && Array.isArray(data["@graph"])) {
        candidates.push(...data["@graph"]);
      } else {
        candidates.push(data);
      }

      for (const node of candidates) {
        const type = node["@type"];
        const isProduct =
          type === "Product" ||
          (Array.isArray(type) && type.includes("Product"));
        if (!isProduct) continue;

        const title = String(node.name ?? "").trim();
        if (!title) continue; // skip empty nodes

        // Image
        let imageUrl = "";
        if (typeof node.image === "string") imageUrl = node.image;
        else if (Array.isArray(node.image) && node.image.length > 0)
          imageUrl = typeof node.image[0] === "string" ? node.image[0] : node.image[0]?.url ?? "";
        else if (node.image?.url) imageUrl = node.image.url;

        // Price — look in offers
        let price: number | null = null;
        const offers = node.offers;
        if (offers) {
          const offerList = Array.isArray(offers) ? offers : [offers];
          for (const offer of offerList) {
            const raw = offer.price ?? offer.lowPrice ?? offer.highPrice;
            if (raw != null) {
              const n = parseFloat(String(raw).replace(/,/g, ""));
              if (!isNaN(n) && n > 0) { price = n; break; }
            }
          }
        }
        // Also try top-level price
        if (price === null && node.price != null) {
          const n = parseFloat(String(node.price).replace(/,/g, ""));
          if (!isNaN(n) && n > 0) price = n;
        }

        const description = String(node.description ?? "").trim().substring(0, 300);

        return { title: title.substring(0, 200), imageUrl, price, description };
      }
    } catch {
      // Malformed JSON — skip this block
    }
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// OpenGraph / meta tag extraction
// ─────────────────────────────────────────────────────────────────────────────
function extractOgMeta(html: string) {
  const ogTitle =
    html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)?.[1] ??
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i)?.[1] ??
    html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] ??
    "";
  const ogImage =
    html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)?.[1] ??
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i)?.[1] ??
    "";
  const ogDesc =
    html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i)?.[1] ??
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:description["']/i)?.[1] ??
    "";
  return {
    title: ogTitle.trim().substring(0, 200),
    imageUrl: ogImage.trim(),
    description: ogDesc.trim().substring(0, 300),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Improved price extraction fallbacks
// ─────────────────────────────────────────────────────────────────────────────
function extractPrice(html: string): number | null {
  const patterns = [
    // Structured data / microdata
    /itemprop=["']price["'][^>]+content=["']([\d.,]+)["']/i,
    /content=["']([\d.,]+)["'][^>]+itemprop=["']price["']/i,
    // JSON price fields (case-insensitive)
    /"[Pp]rice"\s*:\s*"?([\d.,]+)"?/,
    /"[Pp]rice[Vv]alue"\s*:\s*"?([\d.,]+)"?/,
    /"originalPrice"\s*:\s*"?([\d.,]+)"?/,
    /"specialPrice"\s*:\s*"?([\d.,]+)"?/,
    /"wasPrice"\s*:\s*"?([\d.,]+)"?/,
    /"nowPrice"\s*:\s*"?([\d.,]+)"?/,
    // data-price attribute
    /data-price=["']([\d.,]+)["']/i,
    // Home Depot specific price patterns
    /class=["'][^"']*price__dollars[^"']*["'][^>]*>([\d,]+)/i,
    /class=["'][^"']*price-format__main-price[^"']*["'][^>]*>\s*\$?([\d,]+(?:\.\d{2})?)/i,
    /data-automation-id=["']productPrice["'][^>]*>\s*\$?([\d,]+\.\d{2})/i,
    // Visible dollar amounts — $47.98 or $1,234.56
    /\$([\d,]+\.\d{2})/,
    // per-unit formats — 47.98/each, 47.98/sq ft
    /([\d,]+\.\d{2})\s*\/\s*(?:each|sq|ft|pc|piece|unit|lf)/i,
    // sale-price / regular-price spans
    /class=["'][^"']*(?:sale|regular|current)[^"']*price[^"']*["'][^>]*>\s*\$?([\d,]+\.\d{2})/i,
  ];
  for (const pat of patterns) {
    const m = html.match(pat);
    if (m) {
      const n = parseFloat(m[1].replace(/,/g, ""));
      if (!isNaN(n) && n > 0 && n < 1_000_000) return n;
    }
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Home Depot fast path
// ─────────────────────────────────────────────────────────────────────────────
function extractHdItemNumber(url: string): string | null {
  // Patterns:
  //   /p/Product-Name/123456789
  //   /p/123456789
  //   ?itemId=123456789
  const patterns = [
    /\/p\/[^/]+\/(\d{6,10})(?:[?#]|$)/,
    /\/p\/(\d{6,10})(?:[?#]|$)/,
    /[?&]itemId=(\d{6,10})/i,
    /\/(\d{9})(?:[?#]|$)/,
  ];
  for (const pat of patterns) {
    const m = url.match(pat);
    if (m) return m[1];
  }
  return null;
}

async function tryHdFastPath(url: string, itemNumber: string): Promise<ScrapedProduct | null> {
  // Home Depot's internal product summary endpoint (publicly accessible, no auth required)
  const apiUrl = `https://www.homedepot.com/federation-gateway/graphql?opname=productClientOnlyProduct`;
  // Simpler: use the product detail API that HD's own site uses
  const summaryUrl = `https://www.homedepot.com/p/${itemNumber}`;

  try {
    // Try HD's internal product data endpoint
    const hdApiUrl = `https://api.homedepot.com/v2/products/${itemNumber}?apikey=undefined`;
    // This often returns 403. Instead use the known-working product page with Accept: application/json
    // The most reliable HD fast path is their product detail page with a JSON accept header
    const resp = await fetch(
      `https://www.homedepot.com/p/${itemNumber}`,
      {
        headers: {
          ...BROWSER_HEADERS,
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
        signal: AbortSignal.timeout(12000),
        redirect: "follow",
      }
    );

    if (!resp.ok) return null;
    const html = await resp.text();

    // Try JSON-LD first
    const ld = extractFromJsonLd(html);
    if (ld && ld.title) {
      const og = extractOgMeta(html);
      const finalPrice = ld.price ?? extractPrice(html);
      return {
        title: ld.title.replace(/\s*-\s*The Home Depot\s*$/i, "").replace(/\s*\|.*$/, "").trim(),
        imageUrl: ld.imageUrl || og.imageUrl,
        price: finalPrice,
        description: ld.description || og.description,
        sourceUrl: url,
        priceUnconfirmed: finalPrice === null,
      };
    }

    // Fall back to OG meta
    const og = extractOgMeta(html);
    const price = extractPrice(html);
    if (og.title) {
      return {
        title: og.title.replace(/\s*-\s*The Home Depot\s*$/i, "").replace(/\s*\|.*$/, "").trim(),
        imageUrl: og.imageUrl,
        price,
        description: og.description,
        sourceUrl: url,
        priceUnconfirmed: price === null,
      };
    }
  } catch {
    // Network error or timeout — fall through to graceful partial
  }

  return null;
}

function hdGracefulPartial(url: string, itemNumber: string): ScrapedProduct {
  return {
    title: `Home Depot Item #${itemNumber}`,
    imageUrl: "",
    price: null,
    description:
      `Item #${itemNumber} — price could not be fetched automatically. ` +
      `Please open the product page to confirm the price before saving.`,
    sourceUrl: url,
    priceUnconfirmed: true,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Main scrape function — used by both scrapeProduct and parseProductHtml
// ─────────────────────────────────────────────────────────────────────────────
export function parseProductFromHtml(html: string, sourceUrl: string): ScrapedProduct {
  // 1. JSON-LD first
  const ld = extractFromJsonLd(html);
  const og = extractOgMeta(html);

  const title = (ld?.title || og.title)
    .replace(/\s*-\s*The Home Depot\s*$/i, "")
    .replace(/\s*\|.*$/, "")
    .trim();

  const imageUrl = ld?.imageUrl || og.imageUrl;
  const price = ld?.price ?? extractPrice(html);
  const description = ld?.description || og.description;

  // HD-specific extras
  const hdModelMatch = html.match(/Model\s*#\s*([A-Z0-9\-]+)/i) ?? html.match(/Model Number[^>]*>([A-Z0-9\-]+)/i);
  const modelNumber = hdModelMatch?.[1]?.trim() ?? "";
  const hdItemIdMatch = sourceUrl.match(/\/p\/[^/]+\/(\d+)$/) ?? sourceUrl.match(/\/(\d{8,10})$/);
  const hdItemId = hdItemIdMatch?.[1] ?? "";

  const descParts = [description];
  if (modelNumber) descParts.push(`Model# ${modelNumber}`);
  if (hdItemId) descParts.push(`Item# ${hdItemId}`);

  return {
    title: title.substring(0, 200) || "Untitled Product",
    imageUrl,
    price,
    description: descParts.filter(Boolean).join(" | ").substring(0, 300),
    sourceUrl,
    priceUnconfirmed: price === null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Exported: scrape a product URL from the server
// ─────────────────────────────────────────────────────────────────────────────
export async function scrapeProductUrl(url: string): Promise<ScrapedProduct> {
  const isHD = (() => {
    try { return new URL(url).hostname.replace("www.", "") === "homedepot.com"; } catch { return false; }
  })();

  if (isHD) {
    const itemNumber = extractHdItemNumber(url);
    if (itemNumber) {
      const fast = await tryHdFastPath(url, itemNumber);
      if (fast) return fast;
      // Graceful partial — we have the item number even if fetch failed
      return hdGracefulPartial(url, itemNumber);
    }
  }

  // General path — strengthened browser-like fetch
  const resp = await fetch(url, {
    headers: {
      ...BROWSER_HEADERS,
      "Referer": (() => { try { const u = new URL(url); return `${u.protocol}//${u.hostname}/`; } catch { return "https://www.google.com/"; } })(),
    },
    signal: AbortSignal.timeout(12000),
    redirect: "follow",
  });

  if (!resp.ok) {
    if (resp.status === 403 || resp.status === 429) {
      throw Object.assign(new Error(`Site blocked automatic import (HTTP ${resp.status}). Try opening in a new tab and copying details manually.`), { httpStatus: resp.status });
    }
    throw new Error(`HTTP ${resp.status} — could not fetch product page.`);
  }

  const html = await resp.text();
  return parseProductFromHtml(html, url);
}
