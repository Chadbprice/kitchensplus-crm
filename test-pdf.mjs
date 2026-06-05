import puppeteer from "puppeteer-core";
import { writeFileSync } from "fs";

const browser = await puppeteer.launch({
  executablePath: "/usr/bin/chromium-browser",
  args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu", "--no-first-run", "--no-zygote"],
  headless: true,
});

try {
  const page = await browser.newPage();
  await page.setContent("<html><body><h1>Test PDF</h1><p>Hello from puppeteer</p></body></html>", { waitUntil: "networkidle0" });
  const pdf = await page.pdf({ format: "Letter", printBackground: true });
  const buf = Buffer.from(pdf);
  writeFileSync("/tmp/test-output.pdf", buf);
  console.log("PDF generated successfully, size:", buf.length, "bytes");
} finally {
  await browser.close();
}
