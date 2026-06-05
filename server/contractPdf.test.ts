/**
 * contractPdf.test.ts
 *
 * Tests for the generateSignedContractPdf helper.
 *
 * PDFKit encodes all text as hex strings inside compressed content streams,
 * e.g. <4a616e6520446f65> = "Jane Doe".
 * extractPdfText() decompresses each FlateDecode stream and decodes all
 * hex-encoded strings into a single searchable text blob.
 */
import { describe, it, expect } from "vitest";
import { generateSignedContractPdf } from "./contractPdf";
import zlib from "zlib";

const SAMPLE_SIG_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

const baseData = {
  invoiceNumber: "INV-2026-042",
  invoiceType: "deposit" as const,
  invoiceAmount: 3750.0,
  clientName: "Jane Doe",
  clientEmail: "jane@example.com",
  clientPhone: "(864) 555-1234",
  clientAddress: "123 Main St, Spartanburg, SC 29301",
  projectTitle: "Kitchen Renovation",
  signatureDataUrl: SAMPLE_SIG_DATA_URL,
  signerName: "Jane Doe",
  signedAt: new Date("2026-03-30T14:00:00Z"),
  signerIp: "192.168.1.1",
};

/**
 * Extract all readable text from a PDFKit-generated PDF buffer.
 * PDFKit encodes text as hex strings <HEXHEX> inside FlateDecode streams.
 * This helper:
 *   1. Decompresses each zlib-compressed stream
 *   2. Finds all hex-encoded strings and decodes them to UTF-8
 *   3. Returns a single concatenated string for easy assertion
 */
function extractPdfText(buf: Buffer): string {
  const raw = buf.toString("latin1");
  const streamParts: string[] = [];

  const streamRegex = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let match: RegExpExecArray | null;

  while ((match = streamRegex.exec(raw)) !== null) {
    try {
      const compressed = Buffer.from(match[1], "latin1");
      const decompressed = zlib.inflateSync(compressed);
      const streamText = decompressed.toString("latin1");

      // Collect all hex tokens per stream and join WITHOUT spaces
      // (PDFKit splits words into multiple hex tokens for kerning)
      const hexTokens: string[] = [];
      const hexPattern = /<([0-9a-fA-F]+)>/g;
      let hexMatch: RegExpExecArray | null;
      while ((hexMatch = hexPattern.exec(streamText)) !== null) {
        try {
          hexTokens.push(Buffer.from(hexMatch[1], "hex").toString("utf8"));
        } catch {
          // Skip malformed hex
        }
      }
      if (hexTokens.length > 0) {
        streamParts.push(hexTokens.join(""));
      }

      // Also capture plain parenthesized strings: (text)
      const parenPattern = /\(([^)\\]+)\)/g;
      let parenMatch: RegExpExecArray | null;
      while ((parenMatch = parenPattern.exec(streamText)) !== null) {
        streamParts.push(parenMatch[1]);
      }
    } catch {
      // Not a zlib stream — skip
    }
  }

  return streamParts.join(" ");
}

describe("generateSignedContractPdf", () => {
  it("returns a non-empty Buffer", async () => {
    const buf = await generateSignedContractPdf(baseData);
    expect(buf).toBeInstanceOf(Buffer);
    expect(buf.length).toBeGreaterThan(1000);
  });

  it("output starts with PDF magic bytes (%PDF)", async () => {
    const buf = await generateSignedContractPdf(baseData);
    const header = buf.slice(0, 4).toString("ascii");
    expect(header).toBe("%PDF");
  });

  it("PDF contains the invoice number", async () => {
    const buf = await generateSignedContractPdf(baseData);
    const text = extractPdfText(buf);
    expect(text).toContain("INV-2026-042");
  });

  it("PDF contains the signer name", async () => {
    const buf = await generateSignedContractPdf(baseData);
    const text = extractPdfText(buf);
    expect(text).toContain("Jane Doe");
  });

  it("PDF contains E-SIGN legal disclaimer text", async () => {
    const buf = await generateSignedContractPdf(baseData);
    const text = extractPdfText(buf);
    expect(text).toContain("E-SIGN");
  });

  it("PDF contains ELECTRONICALLY SIGNED header", async () => {
    const buf = await generateSignedContractPdf(baseData);
    const text = extractPdfText(buf);
    expect(text).toContain("ELECTRONICALLY SIGNED");
  });

  it("generates without crashing when optional fields are missing", async () => {
    const minimalData = {
      invoiceNumber: "INV-MIN-001",
      invoiceAmount: 500,
      clientName: "John Smith",
      signatureDataUrl: SAMPLE_SIG_DATA_URL,
      signerName: "John Smith",
      signedAt: new Date(),
    };
    const buf = await generateSignedContractPdf(minimalData);
    expect(buf).toBeInstanceOf(Buffer);
    expect(buf.length).toBeGreaterThan(500);
  });

  it("generates without crashing when signature image is invalid base64", async () => {
    const dataWithBadSig = {
      ...baseData,
      signatureDataUrl: "data:image/png;base64,NOTVALIDBASE64!!!",
    };
    // Should not throw — falls back to a placeholder line
    const buf = await generateSignedContractPdf(dataWithBadSig);
    expect(buf).toBeInstanceOf(Buffer);
    expect(buf.length).toBeGreaterThan(500);
  });

  it("includes invoice notes when provided", async () => {
    const dataWithNotes = {
      ...baseData,
      invoiceNotes: "Custom cabinet installation in master kitchen.",
    };
    const buf = await generateSignedContractPdf(dataWithNotes);
    const text = extractPdfText(buf);
    expect(text).toContain("Custom cabinet");
  });

  it("includes signer IP when provided", async () => {
    const buf = await generateSignedContractPdf(baseData);
    const text = extractPdfText(buf);
    expect(text).toContain("192.168.1.1");
  });

  it("generates a larger PDF when notes are included vs not", async () => {
    const withNotes = await generateSignedContractPdf({
      ...baseData,
      invoiceNotes: "Extra scope details here.",
    });
    const withoutNotes = await generateSignedContractPdf({
      ...baseData,
      invoiceNotes: undefined,
    });
    expect(withNotes.length).toBeGreaterThanOrEqual(withoutNotes.length);
  });

  it("PDF contains client name in extracted text", async () => {
    const buf = await generateSignedContractPdf(baseData);
    const text = extractPdfText(buf);
    // Client name should appear in the PDF
    expect(text).toContain("Jane");
  });
});
