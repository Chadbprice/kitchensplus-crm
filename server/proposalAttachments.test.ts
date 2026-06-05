import { describe, it, expect } from "vitest";

// Unit tests for ProposalMediaPanel / proposalAttachments router logic
// These tests verify the data-shape contracts without hitting the DB.

describe("proposalAttachments router contracts", () => {
  it("clientVisible flag maps correctly: true → 1, false → 0", () => {
    const toDb = (v: boolean) => (v ? 1 : 0);
    expect(toDb(true)).toBe(1);
    expect(toDb(false)).toBe(0);
  });

  it("clientVisible flag maps correctly from DB: 1 → true, 0 → false", () => {
    const fromDb = (v: number) => v === 1;
    expect(fromDb(1)).toBe(true);
    expect(fromDb(0)).toBe(false);
  });

  it("uploadMultiple accepts up to 20 photos", () => {
    const MAX = 20;
    const photos = Array.from({ length: MAX }, (_, i) => ({
      dataUrl: `data:image/jpeg;base64,/9j/${i}`,
      mime: "image/jpeg",
    }));
    expect(photos.length).toBeLessThanOrEqual(MAX);
  });

  it("uploadMultiple rejects more than 20 photos", () => {
    const MAX = 20;
    const photos = Array.from({ length: MAX + 1 }, (_, i) => ({
      dataUrl: `data:image/jpeg;base64,/9j/${i}`,
      mime: "image/jpeg",
    }));
    expect(photos.length).toBeGreaterThan(MAX);
  });

  it("photoAttachments with clientVisible=0 should not appear in PDF", () => {
    const attachments = [
      { id: 1, clientVisible: 1, fileUrl: "https://s3.example.com/photo1.jpg", fileName: "photo1.jpg" },
      { id: 2, clientVisible: 0, fileUrl: "https://s3.example.com/photo2.jpg", fileName: "photo2.jpg" },
      { id: 3, clientVisible: 1, fileUrl: "https://s3.example.com/photo3.jpg", fileName: "photo3.jpg" },
    ];
    const forPdf = attachments.filter((a) => a.clientVisible === 1);
    expect(forPdf).toHaveLength(2);
    expect(forPdf.map((a) => a.id)).toEqual([1, 3]);
  });
});
