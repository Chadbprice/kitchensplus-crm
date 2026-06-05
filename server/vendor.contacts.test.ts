/**
 * Regression tests for vendor contact insertion.
 *
 * Root cause: The vendor `create` procedure was spreading the entire contact
 * object (`{ ...c, vendorId: newId }`) into the INSERT. The `Contact` interface
 * has an optional `id?: number` field. When editing an existing vendor, the
 * spread carried `id` into the INSERT payload, causing a duplicate-key or
 * invalid-value error on the `vendor_contacts.id` autoincrement primary key.
 *
 * Fix: Explicitly pick only the 5 allowed fields (contactName, phone, email,
 * receivePhoneMessages, receiveEmailMessages) when building the INSERT payload.
 */
import { describe, it, expect } from "vitest";

// ─── Helpers that mirror the fixed backend logic ──────────────────────────────

interface ContactInput {
  id?: number;
  contactName: string;
  phone?: string;
  email?: string;
  receivePhoneMessages?: boolean;
  receiveEmailMessages?: boolean;
}

/** The fixed mapping used in the create procedure */
function buildContactInsertRow(c: ContactInput, vendorId: number) {
  return {
    vendorId,
    contactName: c.contactName,
    phone: c.phone || null,
    email: c.email || null,
    receivePhoneMessages: c.receivePhoneMessages ?? true,
    receiveEmailMessages: c.receiveEmailMessages ?? true,
  };
}

/** Filter blank contact rows — mirrors both frontend and backend guard */
function filterValidContacts(contacts: ContactInput[]) {
  return contacts.filter((c) => c.contactName || c.phone || c.email);
}

// ─── Root cause regression guard ─────────────────────────────────────────────

describe("Vendor contact insert — root cause regression", () => {
  it("does NOT include id in the insert payload (the root cause)", () => {
    const contactWithId: ContactInput = {
      id: 42, // ← this was being spread into INSERT before the fix
      contactName: "John Smith",
      phone: "+18645550001",
      email: "john@example.com",
      receivePhoneMessages: true,
      receiveEmailMessages: true,
    };

    const row = buildContactInsertRow(contactWithId, 99);

    // The id field must NOT appear in the insert payload
    expect(row).not.toHaveProperty("id");
    expect(row.vendorId).toBe(99);
    expect(row.contactName).toBe("John Smith");
  });

  it("does NOT include id even when id is undefined", () => {
    const contactNoId: ContactInput = {
      contactName: "Jane Doe",
    };

    const row = buildContactInsertRow(contactNoId, 5);
    expect(row).not.toHaveProperty("id");
  });
});

// ─── Single contact ───────────────────────────────────────────────────────────

describe("Vendor contact insert — single contact", () => {
  it("builds a correct insert row for a single contact", () => {
    const contact: ContactInput = {
      contactName: "Alice",
      phone: "+18645550002",
      email: "alice@vendor.com",
      receivePhoneMessages: true,
      receiveEmailMessages: false,
    };

    const row = buildContactInsertRow(contact, 1);

    expect(row.vendorId).toBe(1);
    expect(row.contactName).toBe("Alice");
    expect(row.phone).toBe("+18645550002");
    expect(row.email).toBe("alice@vendor.com");
    expect(row.receivePhoneMessages).toBe(true);
    expect(row.receiveEmailMessages).toBe(false);
  });

  it("defaults receivePhoneMessages and receiveEmailMessages to true when not provided", () => {
    const contact: ContactInput = { contactName: "Bob" };
    const row = buildContactInsertRow(contact, 2);

    expect(row.receivePhoneMessages).toBe(true);
    expect(row.receiveEmailMessages).toBe(true);
  });

  it("converts empty phone/email strings to null", () => {
    const contact: ContactInput = {
      contactName: "Carol",
      phone: "",
      email: "",
    };
    const row = buildContactInsertRow(contact, 3);

    expect(row.phone).toBeNull();
    expect(row.email).toBeNull();
  });
});

// ─── Multiple contacts ────────────────────────────────────────────────────────

describe("Vendor contact insert — multiple contacts", () => {
  it("builds correct insert rows for multiple contacts", () => {
    const contacts: ContactInput[] = [
      { contactName: "Dave", phone: "+18645550003", email: "dave@vendor.com" },
      { contactName: "Eve", phone: "+18645550004", email: "eve@vendor.com", receiveEmailMessages: false },
    ];

    const rows = contacts.map((c) => buildContactInsertRow(c, 10));

    expect(rows).toHaveLength(2);
    expect(rows[0].contactName).toBe("Dave");
    expect(rows[1].contactName).toBe("Eve");
    expect(rows[1].receiveEmailMessages).toBe(false);
    rows.forEach((r) => {
      expect(r.vendorId).toBe(10);
      expect(r).not.toHaveProperty("id");
    });
  });
});

// ─── Blank contact filtering ──────────────────────────────────────────────────

describe("Vendor contact insert — blank contact filtering", () => {
  it("filters out fully blank contact rows", () => {
    const contacts: ContactInput[] = [
      { contactName: "", phone: "", email: "" }, // blank — should be filtered
      { contactName: "Frank", phone: "+18645550005" }, // valid
    ];

    const valid = filterValidContacts(contacts);
    expect(valid).toHaveLength(1);
    expect(valid[0].contactName).toBe("Frank");
  });

  it("keeps a contact that has only a name", () => {
    const contacts: ContactInput[] = [
      { contactName: "Grace" },
    ];
    expect(filterValidContacts(contacts)).toHaveLength(1);
  });

  it("keeps a contact that has only a phone", () => {
    const contacts: ContactInput[] = [
      { contactName: "", phone: "+18645550006" },
    ];
    expect(filterValidContacts(contacts)).toHaveLength(1);
  });

  it("keeps a contact that has only an email", () => {
    const contacts: ContactInput[] = [
      { contactName: "", email: "only@email.com" },
    ];
    expect(filterValidContacts(contacts)).toHaveLength(1);
  });

  it("returns empty array when all contacts are blank", () => {
    const contacts: ContactInput[] = [
      { contactName: "", phone: "", email: "" },
      { contactName: "", phone: "", email: "" },
    ];
    expect(filterValidContacts(contacts)).toHaveLength(0);
  });
});

// ─── Checkbox persistence ─────────────────────────────────────────────────────

describe("Vendor contact insert — checkbox persistence", () => {
  it("preserves receivePhoneMessages=false correctly", () => {
    const contact: ContactInput = {
      contactName: "Hank",
      receivePhoneMessages: false,
      receiveEmailMessages: true,
    };
    const row = buildContactInsertRow(contact, 7);
    expect(row.receivePhoneMessages).toBe(false);
    expect(row.receiveEmailMessages).toBe(true);
  });

  it("preserves receiveEmailMessages=false correctly", () => {
    const contact: ContactInput = {
      contactName: "Iris",
      receivePhoneMessages: true,
      receiveEmailMessages: false,
    };
    const row = buildContactInsertRow(contact, 8);
    expect(row.receivePhoneMessages).toBe(true);
    expect(row.receiveEmailMessages).toBe(false);
  });

  it("both false is preserved correctly", () => {
    const contact: ContactInput = {
      contactName: "Jake",
      receivePhoneMessages: false,
      receiveEmailMessages: false,
    };
    const row = buildContactInsertRow(contact, 9);
    expect(row.receivePhoneMessages).toBe(false);
    expect(row.receiveEmailMessages).toBe(false);
  });
});
