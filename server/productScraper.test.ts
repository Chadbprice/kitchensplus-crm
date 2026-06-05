/**
 * productScraper.test.ts
 *
 * Tests for the productScraper module:
 *   - parseProductFromHtml (pure function, no network)
 *   - JSON-LD extraction
 *   - OG meta fallback
 *   - Price extraction patterns
 *   - HD-specific cleanup
 */
import { describe, it, expect } from "vitest";
import { parseProductFromHtml } from "./productScraper.js";

const SOURCE = "https://www.homedepot.com/p/Test-Product/123456789";

describe("parseProductFromHtml", () => {
  it("extracts title and price from JSON-LD Product schema", () => {
    const html = `
      <html>
        <head>
          <script type="application/ld+json">
          {
            "@context": "https://schema.org",
            "@type": "Product",
            "name": "Glacier Bay 4 in. Centerset Bathroom Faucet",
            "image": "https://images.thdstatic.com/faucet.jpg",
            "description": "A beautiful bathroom faucet.",
            "offers": {
              "@type": "Offer",
              "price": "47.98",
              "priceCurrency": "USD"
            }
          }
          </script>
        </head>
        <body></body>
      </html>
    `;
    const result = parseProductFromHtml(html, SOURCE);
    expect(result.title).toBe("Glacier Bay 4 in. Centerset Bathroom Faucet");
    expect(result.price).toBe(47.98);
    expect(result.imageUrl).toBe("https://images.thdstatic.com/faucet.jpg");
    expect(result.description).toContain("beautiful bathroom faucet");
  });

  it("extracts from JSON-LD @graph array", () => {
    const html = `
      <script type="application/ld+json">
      {
        "@context": "https://schema.org",
        "@graph": [
          { "@type": "WebSite", "name": "Home Depot" },
          {
            "@type": "Product",
            "name": "Delta Faucet",
            "offers": { "@type": "Offer", "price": "129.00" }
          }
        ]
      }
      </script>
    `;
    const result = parseProductFromHtml(html, SOURCE);
    expect(result.title).toBe("Delta Faucet");
    expect(result.price).toBe(129.00);
  });

  it("falls back to OG meta when no JSON-LD is present", () => {
    const html = `
      <html>
        <head>
          <meta property="og:title" content="Moen Shower Head Chrome" />
          <meta property="og:image" content="https://cdn.example.com/shower.jpg" />
          <meta property="og:description" content="Premium chrome shower head." />
        </head>
        <body><span itemprop="price" content="89.99"></span></body>
      </html>
    `;
    const result = parseProductFromHtml(html, SOURCE);
    expect(result.title).toBe("Moen Shower Head Chrome");
    expect(result.imageUrl).toBe("https://cdn.example.com/shower.jpg");
    expect(result.description).toContain("chrome shower head");
  });

  it("strips '- The Home Depot' suffix from title", () => {
    const html = `
      <script type="application/ld+json">
      { "@type": "Product", "name": "Kohler Toilet - The Home Depot", "offers": { "price": "299.00" } }
      </script>
    `;
    const result = parseProductFromHtml(html, SOURCE);
    expect(result.title).toBe("Kohler Toilet");
  });

  it("strips pipe-separated suffix from title", () => {
    const html = `
      <meta property="og:title" content="Moen Faucet | Lowe's" />
    `;
    const result = parseProductFromHtml(html, "https://www.lowes.com/p/moen/123");
    expect(result.title).toBe("Moen Faucet");
  });

  it("extracts price from itemprop content attribute", () => {
    const html = `
      <meta property="og:title" content="Test Product" />
      <span itemprop="price" content="59.99"></span>
    `;
    const result = parseProductFromHtml(html, SOURCE);
    expect(result.price).toBe(59.99);
  });

  it("extracts price from dollar sign pattern", () => {
    const html = `
      <meta property="og:title" content="Test Product" />
      <div class="price">$1,234.56</div>
    `;
    const result = parseProductFromHtml(html, SOURCE);
    expect(result.price).toBe(1234.56);
  });

  it("extracts price from JSON price field (capital P)", () => {
    const html = `
      <meta property="og:title" content="Test Product" />
      <script>var data = {"Price": "79.99"};</script>
    `;
    const result = parseProductFromHtml(html, SOURCE);
    expect(result.price).toBe(79.99);
  });

  it("extracts price from per-unit format", () => {
    const html = `
      <meta property="og:title" content="Tile" />
      <span>3.49/sq ft</span>
    `;
    const result = parseProductFromHtml(html, SOURCE);
    expect(result.price).toBe(3.49);
  });

  it("returns null price when no price pattern matches", () => {
    const html = `<meta property="og:title" content="No Price Product" />`;
    const result = parseProductFromHtml(html, SOURCE);
    expect(result.price).toBeNull();
  });

  it("returns Untitled Product when no title is found", () => {
    const html = `<html><body>No metadata here</body></html>`;
    const result = parseProductFromHtml(html, SOURCE);
    expect(result.title).toBe("Untitled Product");
  });

  it("truncates title to 200 chars", () => {
    const longTitle = "A".repeat(300);
    const html = `<meta property="og:title" content="${longTitle}" />`;
    const result = parseProductFromHtml(html, SOURCE);
    expect(result.title.length).toBeLessThanOrEqual(200);
  });

  it("sets sourceUrl correctly", () => {
    const url = "https://www.flooranddecor.com/p/tile/12345";
    const html = `<meta property="og:title" content="Marble Tile" />`;
    const result = parseProductFromHtml(html, url);
    expect(result.sourceUrl).toBe(url);
  });

  it("prefers JSON-LD price over OG meta when both are present", () => {
    const html = `
      <meta property="og:title" content="Faucet" />
      <script type="application/ld+json">
      { "@type": "Product", "name": "Faucet", "offers": { "price": "149.00" } }
      </script>
      <span class="price">$99.99</span>
    `;
    const result = parseProductFromHtml(html, SOURCE);
    expect(result.price).toBe(149.00);
  });

  it("handles malformed JSON-LD gracefully and falls back to OG meta", () => {
    const html = `
      <script type="application/ld+json">{ INVALID JSON </script>
      <meta property="og:title" content="Fallback Product" />
      <meta property="og:description" content="Fallback desc" />
    `;
    const result = parseProductFromHtml(html, SOURCE);
    expect(result.title).toBe("Fallback Product");
  });
});
