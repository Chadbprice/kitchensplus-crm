import {
  int,
  tinyint,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
  decimal,
  boolean,
  json,
  date,
} from "drizzle-orm/mysql-core";

// ─── USERS (auth base) ───────────────────────────────────────────────────────
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  phone: varchar("phone", { length: 20 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["owner", "admin", "crew", "client", "vendor", "user"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

// ─── LEADS ───────────────────────────────────────────────────────────────────
export const leads = mysqlTable("leads", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  email: varchar("email", { length: 320 }),
  email2: varchar("email2", { length: 320 }),
  email3: varchar("email3", { length: 320 }),
  phone: varchar("phone", { length: 20 }),
  phone2: varchar("phone2", { length: 20 }),
  phone3: varchar("phone3", { length: 20 }),
  projectType: varchar("projectType", { length: 100 }),
  status: mysqlEnum("status", ["new", "consultation_scheduled", "visited", "quoted", "won", "lost"]).default("new").notNull(),
  source: varchar("source", { length: 100 }),
  notes: text("notes"),
  internalNotes: text("internalNotes"),
  address: text("address"),
  addressPlaceId: varchar("addressPlaceId", { length: 255 }),
  assignedTo: int("assignedTo"),
  firstContactSentAt: timestamp("firstContactSentAt"),
  archivedAt: timestamp("archivedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// ─── MEETINGS ────────────────────────────────────────────────────────────────
export const meetings = mysqlTable("meetings", {
  id: int("id").autoincrement().primaryKey(),
  leadId: int("leadId").notNull(),
  scheduledAt: timestamp("scheduledAt"),
  assignee: varchar("assignee", { length: 255 }),
  internalNotes: text("internalNotes"),
  aiNotes: text("aiNotes"),
  status: mysqlEnum("meetingStatus", ["scheduled", "confirmed", "completed", "cancelled"]).default("scheduled").notNull(),
  confirmedAt: timestamp("confirmedAt"),
  googleCalendarEventId: varchar("googleCalendarEventId", { length: 255 }),
  emailSent: int("emailSent").default(0),
  smsSent: int("smsSent").default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type Meeting = typeof meetings.$inferSelect;
export type InsertMeeting = typeof meetings.$inferInsert;

// ─── CLIENTS ─────────────────────────────────────────────────────────────────
export const clients = mysqlTable("clients", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId"),
  name: varchar("name", { length: 255 }).notNull(),
  email: varchar("email", { length: 320 }),
  phone: varchar("phone", { length: 20 }),
  address: text("address"),
  notes: text("notes"),
  magicLinkToken: varchar("magicLinkToken", { length: 128 }),
  magicLinkExpiry: timestamp("magicLinkExpiry"),
  archivedAt: timestamp("archivedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// ─── VENDORS ─────────────────────────────────────────────────────────────────
export const vendors = mysqlTable("vendors", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId"),
  companyName: varchar("companyName", { length: 255 }).notNull(),
  companyEmail: varchar("companyEmail", { length: 320 }),
  website: varchar("website", { length: 512 }),
  trade: varchar("trade", { length: 100 }),
  hourlyRate: decimal("hourlyRate", { precision: 10, scale: 2 }),
  availability: mysqlEnum("availability", ["available", "busy", "unavailable"]).default("available"),
  performanceScore: decimal("performanceScore", { precision: 3, scale: 1 }),
  onTimePercentage: decimal("onTimePercentage", { precision: 5, scale: 2 }),
  qualityScore: decimal("qualityScore", { precision: 3, scale: 1 }),
  responsivenessScore: decimal("responsivenessScore", { precision: 3, scale: 1 }),
  tier: mysqlEnum("tier", ["elite", "preferred", "standard", "do_not_use"]).default("standard"),
  lastScorecardAt: timestamp("lastScorecardAt"),
  notes: text("notes"),
  isActive: boolean("isActive").default(true),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// ─── VENDOR CONTACTS ──────────────────────────────────────────────────────────
export const vendorContacts = mysqlTable("vendor_contacts", {
  id: int("id").autoincrement().primaryKey(),
  vendorId: int("vendorId").notNull(),
  contactName: varchar("contactName", { length: 255 }).notNull(),
  phone: varchar("phone", { length: 20 }),
  email: varchar("email", { length: 320 }),
  receivePhoneMessages: boolean("receivePhoneMessages").default(true),
  receiveEmailMessages: boolean("receiveEmailMessages").default(true),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// ─── VENDOR COMPLIANCE DOCS ───────────────────────────────────────────────────
export const vendorDocs = mysqlTable("vendor_docs", {
  id: int("id").autoincrement().primaryKey(),
  vendorId: int("vendorId").notNull(),
  docType: mysqlEnum("docType", ["insurance", "license", "w9", "coi", "workers_comp", "other"]).notNull(),
  fileName: varchar("fileName", { length: 255 }),
  fileUrl: text("fileUrl"),
  fileKey: varchar("fileKey", { length: 512 }),
  expiryDate: timestamp("expiryDate"),
  isRequired: boolean("isRequired").default(true),
  status: mysqlEnum("status", ["pending", "approved", "expired", "rejected"]).default("pending"),
  uploadedAt: timestamp("uploadedAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// ─── CREW MEMBERS ────────────────────────────────────────────────────────────
export const crewMembers = mysqlTable("crew_members", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId"),
  name: varchar("name", { length: 255 }).notNull(),
  email: varchar("email", { length: 320 }),
  phone: varchar("phone", { length: 20 }),
  role: varchar("role", { length: 100 }),
  hourlyRate: decimal("hourlyRate", { precision: 10, scale: 2 }),
  isActive: boolean("isActive").default(true),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// ─── PROJECTS ─────────────────────────────────────────────────────────────────
export const projects = mysqlTable("projects", {
  id: int("id").autoincrement().primaryKey(),
  leadId: int("leadId"),
  clientId: int("clientId"),
  name: varchar("name", { length: 255 }).notNull(),
  projectType: varchar("projectType", { length: 100 }),
  status: mysqlEnum("status", ["planning", "active", "on_hold", "completed", "cancelled"]).default("planning").notNull(),
  address: text("address"),
  description: text("description"),
  scopeOfWork: text("scopeOfWork"),
  startDate: timestamp("startDate"),
  estimatedEndDate: timestamp("estimatedEndDate"),
  actualEndDate: timestamp("actualEndDate"),
  budgetEstimated: decimal("budgetEstimated", { precision: 12, scale: 2 }),
  budgetActual: decimal("budgetActual", { precision: 12, scale: 2 }),
  depositPercent: decimal("depositPercent", { precision: 5, scale: 2 }).default("50.00"),
  squareDepositLinkId: varchar("squareDepositLinkId", { length: 255 }),
  squareDepositStatus: mysqlEnum("squareDepositStatus", ["pending", "paid", "refunded"]).default("pending"),
  aiUpdateFrequency: mysqlEnum("aiUpdateFrequency", ["daily", "every_few_days", "weekly", "manual"]).default("weekly"),
  googleReviewSent: boolean("googleReviewSent").default(false),
  completionFollowupSent: boolean("completionFollowupSent").default(false),
  color: varchar("color", { length: 20 }),
  estimateId: int("estimateId"),
  archivedAt: timestamp("archivedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
// ─── PROJECT MILESTONES ───────────────────────────────────────────────────────
export const milestones = mysqlTable("milestones", {
  id: int("id").autoincrement().primaryKey(),
  projectId: int("projectId").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  dueDate: timestamp("dueDate"),
  completedAt: timestamp("completedAt"),
  status: mysqlEnum("status", ["pending", "in_progress", "completed", "delayed"]).default("pending"),
  billingAmount: decimal("billingAmount", { precision: 12, scale: 2 }),
  squarePaymentLinkId: varchar("squarePaymentLinkId", { length: 255 }),
  squarePaymentStatus: mysqlEnum("squarePaymentStatus", ["none", "pending", "paid"]).default("none"),
  sortOrder: int("sortOrder").default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// ─── PROJECT ASSIGNMENTS ──────────────────────────────────────────────────────
export const projectAssignments = mysqlTable("project_assignments", {
  id: int("id").autoincrement().primaryKey(),
  projectId: int("projectId").notNull(),
  assigneeType: mysqlEnum("assigneeType", ["crew", "vendor"]).notNull(),
  assigneeId: int("assigneeId").notNull(),
  role: varchar("role", { length: 100 }),
  startDate: timestamp("startDate"),
  endDate: timestamp("endDate"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// ─── ESTIMATES ────────────────────────────────────────────────────────────────
export const estimates = mysqlTable("estimates", {
  id: int("id").autoincrement().primaryKey(),
  projectId: int("projectId"),
  leadId: int("leadId"),
  clientId: int("clientId"),
  estimateNumber: varchar("estimateNumber", { length: 50 }),
  title: varchar("title", { length: 255 }),
  status: mysqlEnum("status", ["draft", "sent", "viewed", "approved", "rejected", "expired"]).default("draft").notNull(),
  subtotal: decimal("subtotal", { precision: 12, scale: 2 }).default("0.00"),
  taxRate: decimal("taxRate", { precision: 5, scale: 2 }).default("0.00"),
  taxAmount: decimal("taxAmount", { precision: 12, scale: 2 }).default("0.00"),
  total: decimal("total", { precision: 12, scale: 2 }).default("0.00"),
  depositPercent: decimal("depositPercent", { precision: 5, scale: 2 }).default("50.00"),
  depositAmount: decimal("depositAmount", { precision: 12, scale: 2 }).default("0.00"),
  notes: text("notes"),
  validUntil: timestamp("validUntil"),
  approvedAt: timestamp("approvedAt"),
  sentAt: timestamp("sentAt"),
  pdfUrl: text("pdfUrl"),
  pdfKey: varchar("pdfKey", { length: 512 }),
  discussionAt: timestamp("discussionAt"),
  clientDiscussionNote: text("clientDiscussionNote"),
  signatureDataUrl: text("signatureDataUrl"),
  signerName: varchar("signerName", { length: 255 }),
  signerIp: varchar("signerIp", { length: 64 }),
  signedAt: timestamp("signedAt"),
  signedPdfUrl: text("signedPdfUrl"),
  signedPdfKey: varchar("signedPdfKey", { length: 512 }),
  hidePrices: tinyint("hidePrices").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// ─── ESTIMATE LINE ITEMS ──────────────────────────────────────────────────────
export const estimateLineItems = mysqlTable("estimate_line_items", {
  id: int("id").autoincrement().primaryKey(),
  estimateId: int("estimateId").notNull(),
  task: varchar("task", { length: 255 }),
  description: text("description"),
  category: varchar("category", { length: 100 }),
  quantity: decimal("quantity", { precision: 10, scale: 2 }).default("1.00"),
  unit: varchar("unit", { length: 50 }),
  unitCost: decimal("unitCost", { precision: 12, scale: 2 }).default("0.00"),
  markupPercent: decimal("markupPercent", { precision: 5, scale: 2 }).default("0.00"),
  unitPrice: decimal("unitPrice", { precision: 12, scale: 2 }).default("0.00"),
  lineTotal: decimal("lineTotal", { precision: 12, scale: 2 }).default("0.00"),
  showMarkup: boolean("showMarkup").default(false),
  productUrl: text("productUrl"),
  productSource: varchar("productSource", { length: 100 }),
  imageUrl: text("imageUrl"),
  clientApproved: boolean("clientApproved").default(false),
  sortOrder: int("sortOrder").default(0),
  // ─── Internal costing fields (NEVER returned to client portal) ───
  internalCost: decimal("internalCost", { precision: 12, scale: 2 }).default("0.00"),
  subcontractorId: int("subcontractorId"),  // assigned subcontractor for this line item
  selfPerformed: tinyint("selfPerformed").default(0),  // 1 = owner crew does this work
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// ─── PURCHASE ORDERS ──────────────────────────────────────────────────────────
export const purchaseOrders = mysqlTable("purchase_orders", {
  id: int("id").autoincrement().primaryKey(),
  projectId: int("projectId").notNull(),
  vendorId: int("vendorId"),
  poNumber: varchar("poNumber", { length: 50 }),
  title: varchar("title", { length: 255 }),
  status: mysqlEnum("status", ["draft", "request_sent", "quote_received", "approved", "sent", "acknowledged", "delivered", "invoiced", "paid", "cancelled"]).default("draft").notNull(),
  subtotal: decimal("subtotal", { precision: 12, scale: 2 }).default("0.00"),
  total: decimal("total", { precision: 12, scale: 2 }).default("0.00"),
  notes: text("notes"),
  expectedDelivery: timestamp("expectedDelivery"),
  deliveredAt: timestamp("deliveredAt"),
  invoiceUrl: text("invoiceUrl"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// ─── PO LINE ITEMS ────────────────────────────────────────────────────────────
export const poLineItems = mysqlTable("po_line_items", {
  id: int("id").autoincrement().primaryKey(),
  poId: int("poId").notNull(),
  itemTitle: varchar("itemTitle", { length: 255 }),
  description: text("description").notNull(),
  quantity: decimal("quantity", { precision: 10, scale: 2 }).default("1.00"),
  unit: varchar("unit", { length: 50 }),
  unitCost: decimal("unitCost", { precision: 12, scale: 2 }).default("0.00"),
  lineTotal: decimal("lineTotal", { precision: 12, scale: 2 }).default("0.00"),
  sortOrder: int("sortOrder").default(0),
});

// ─── VENDOR QUOTES ────────────────────────────────────────────────────────────
export const vendorQuotes = mysqlTable("vendor_quotes", {
  id: int("id").autoincrement().primaryKey(),
  projectId: int("projectId").notNull(),
  vendorId: int("vendorId").notNull(),
  status: mysqlEnum("status", ["requested", "submitted", "accepted", "rejected"]).default("requested").notNull(),
  amount: decimal("amount", { precision: 12, scale: 2 }),
  description: text("description"),
  notes: text("notes"),
  submittedAt: timestamp("submittedAt"),
  validUntil: timestamp("validUntil"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// ─── MESSAGES / COMMUNICATION ─────────────────────────────────────────────────
export const messages = mysqlTable("messages", {
  id: int("id").autoincrement().primaryKey(),
  projectId: int("projectId"),
  leadId: int("leadId"),
  threadType: mysqlEnum("threadType", ["client", "vendor", "internal", "lead"]).notNull(),
  direction: mysqlEnum("direction", ["inbound", "outbound"]).notNull(),
  channel: mysqlEnum("channel", ["sms", "email", "portal", "internal"]).notNull(),
  fromName: varchar("fromName", { length: 255 }),
  fromPhone: varchar("fromPhone", { length: 20 }),
  fromEmail: varchar("fromEmail", { length: 320 }),
  toPhone: varchar("toPhone", { length: 20 }),
  toEmail: varchar("toEmail", { length: 320 }),
  body: text("body").notNull(),
  twilioSid: varchar("twilioSid", { length: 64 }),
  status: mysqlEnum("status", ["draft", "pending_approval", "approved", "sent", "delivered", "failed", "received"]).default("sent").notNull(),
  isAiDraft: boolean("isAiDraft").default(false),
  approvedBy: int("approvedBy"),
  approvedAt: timestamp("approvedAt"),
  scheduledFor: timestamp("scheduledFor"),
  sentAt: timestamp("sentAt"),
  subject: varchar("subject", { length: 500 }),
  gmailMessageId: varchar("gmailMessageId", { length: 255 }),
  gmailThreadId: varchar("gmailThreadId", { length: 255 }),
  accountEmail: varchar("accountEmail", { length: 320 }),
  attachmentUrl: text("attachmentUrl"),
  attachmentName: varchar("attachmentName", { length: 255 }),
  attachmentMime: varchar("attachmentMime", { length: 100 }),
  attachmentsJson: text("attachmentsJson"),
  isRead: boolean("isRead").default(false).notNull(),
  readAt: timestamp("readAt"),
  readBy: varchar("readBy", { length: 100 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// ─── GMAIL SYNC STATE ──────────────────────────────────────────────────────────────────────────────────────
export const gmailSyncState = mysqlTable("gmail_sync_state", {
  id: int("id").autoincrement().primaryKey(),
  accountEmail: varchar("accountEmail", { length: 320 }).notNull(),
  lastHistoryId: varchar("lastHistoryId", { length: 64 }),
  lastSyncAt: timestamp("lastSyncAt"),
  syncedCount: int("syncedCount").default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// ─── PROJECT TASKS (auto-created from proposal line items) ────────────────────
export const projectTasks = mysqlTable("project_tasks", {
  id: int("id").autoincrement().primaryKey(),
  projectId: int("projectId").notNull(),
  estimateLineItemId: int("estimateLineItemId"),
  estimateId: int("estimateId"),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  category: varchar("category", { length: 100 }),
  quantity: varchar("quantity", { length: 50 }),
  unit: varchar("unit", { length: 50 }),
  status: mysqlEnum("status", ["pending","in_progress","completed","blocked"]).default("pending"),
  sortOrder: int("sortOrder").default(0),
  completedAt: timestamp("completedAt"),
  assignedTo: int("assignedTo"),
  notes: text("notes"),
  dueDate: timestamp("dueDate"),
  isQuestion: tinyint("isQuestion").default(0),
  questionReminderSentAt: timestamp("questionReminderSentAt"),
  responseToken: varchar("responseToken", { length: 64 }),
  attachmentUrl: text("attachmentUrl"),
  attachmentName: varchar("attachmentName", { length: 255 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// ─── DOCUMENTS / FILES ────────────────────────────────────────────────────────
export const documents = mysqlTable("documents", {
  id: int("id").autoincrement().primaryKey(),
  projectId: int("projectId"),
  leadId: int("leadId"),
  vendorId: int("vendorId"),
  clientId: int("clientId"),
  uploadedBy: int("uploadedBy"),
  invoiceId: int("invoiceId"),
  docType: mysqlEnum("docType", ["estimate", "contract", "permit", "photo", "drawing", "invoice", "warranty", "compliance", "inspiration", "other"]).notNull(),
  fileName: varchar("fileName", { length: 255 }).notNull(),
  fileUrl: text("fileUrl").notNull(),
  fileKey: varchar("fileKey", { length: 512 }).notNull(),
  mimeType: varchar("mimeType", { length: 100 }),
  fileSize: int("fileSize"),
  roomTag: varchar("roomTag", { length: 100 }),
  description: text("description"),
  version: int("version").default(1),
  isPublic: boolean("isPublic").default(false),
  uploadedByClient: boolean("uploadedByClient").default(false),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// ─── INVOICES ─────────────────────────────────────────────────────────────────
export const invoices = mysqlTable("invoices", {
  id: int("id").autoincrement().primaryKey(),
  projectId: int("projectId"),
  leadId: int("leadId"),
  clientId: int("clientId"),
  invoiceNumber: varchar("invoiceNumber", { length: 50 }),
  invoiceType: mysqlEnum("invoiceType", ["deposit", "progress", "final", "change_order", "other"]).notNull(),
  milestoneId: int("milestoneId"),
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  status: mysqlEnum("status", ["draft", "sent", "paid", "overdue", "cancelled"]).default("draft").notNull(),
  squarePaymentLinkId: varchar("squarePaymentLinkId", { length: 255 }),
  squarePaymentId: varchar("squarePaymentId", { length: 255 }),
  dueDate: timestamp("dueDate"),
  paidAt: timestamp("paidAt"),
  notes: text("notes"),
  pdfUrl: text("pdfUrl"),
  pdfKey: varchar("pdfKey", { length: 512 }),
  squarePaymentUrl: text("squarePaymentUrl"),
  sentAt: timestamp("sentAt"),
  amountPaid: decimal("amountPaid", { precision: 12, scale: 2 }).default("0"),
  followUpCount: int("followUpCount").default(0),
  lastFollowUpAt: timestamp("lastFollowUpAt"),
  contractRequired: boolean("contractRequired").default(false),
  contractSigned: boolean("contractSigned").default(false),
  contractSignedAt: timestamp("contractSignedAt"),
  contractSignerName: varchar("contractSignerName", { length: 255 }),
  contractSignedPdfUrl: text("contractSignedPdfUrl"),
  contractSignedPdfKey: varchar("contractSignedPdfKey", { length: 512 }),
  contractSignToken: varchar("contractSignToken", { length: 128 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// ─── INVOICE PAYMENTS (partial / progressive payment history) ───────────────────
export const invoicePayments = mysqlTable("invoice_payments", {
  id: int("id").autoincrement().primaryKey(),
  invoiceId: int("invoiceId").notNull(),
  projectId: int("projectId"),
  leadId: int("leadId"),
  clientId: int("clientId"),
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  method: mysqlEnum("method", ["square", "check", "cash", "ach", "other"]).default("square").notNull(),
  squarePaymentId: varchar("squarePaymentId", { length: 255 }),
  checkNumber: varchar("checkNumber", { length: 100 }),
  paidDate: date("paidDate"),
  note: text("note"),
  sendReceipt: boolean("sendReceipt").default(false),
  ccOperator: boolean("ccOperator").default(false),
  receiptEmailSentAt: timestamp("receiptEmailSentAt"),
  paidAt: timestamp("paidAt").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
// ─── SCHEDULING EVENTSS ────────────────────────────────────────────────────────
export const scheduleEvents = mysqlTable("schedule_events", {
  id: int("id").autoincrement().primaryKey(),
  projectId: int("projectId"),
  title: varchar("title", { length: 255 }).notNull(),
  eventType: mysqlEnum("eventType", ["milestone", "crew_assignment", "vendor_visit", "delivery", "inspection", "consultation", "other"]).notNull(),
  assigneeType: mysqlEnum("assigneeType", ["crew", "vendor", "owner"]),
  assigneeId: int("assigneeId"),
  startTime: timestamp("startTime").notNull(),
  endTime: timestamp("endTime"),
  allDay: boolean("allDay").default(false),
  location: text("location"),
  notes: text("notes"),
  status: mysqlEnum("status", ["scheduled", "confirmed", "in_progress", "completed", "cancelled", "rescheduled"]).default("scheduled"),
  googleEventId: varchar("googleEventId", { length: 255 }),
  reminderSent24h: boolean("reminderSent24h").default(false),
  reminderSentMorning: boolean("reminderSentMorning").default(false),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// ─── PROJECT TYPES (custom) ───────────────────────────────────────────────────
export const projectTypes = mysqlTable("project_types", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  isDefault: boolean("isDefault").default(false),
  isActive: boolean("isActive").default(true),
  sortOrder: int("sortOrder").default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// ─── APP SETTINGS ─────────────────────────────────────────────────────────────
export const appSettings = mysqlTable("app_settings", {
  id: int("id").autoincrement().primaryKey(),
  key: varchar("key", { length: 100 }).notNull().unique(),
  value: text("value"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// ─── AUTOMATION LOGS ──────────────────────────────────────────────────────────
export const automationLogs = mysqlTable("automation_logs", {
  id: int("id").autoincrement().primaryKey(),
  triggerType: varchar("triggerType", { length: 100 }).notNull(),
  entityType: varchar("entityType", { length: 50 }),
  entityId: int("entityId"),
  status: mysqlEnum("status", ["success", "failed", "skipped"]).notNull(),
  details: text("details"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// ─── CLIENT OTP (phone-based portal login) ──────────────────────────────────
export const clientOtps = mysqlTable("client_otps", {
  id: int("id").autoincrement().primaryKey(),
  phone: varchar("phone", { length: 20 }).notNull(),
  code: varchar("code", { length: 6 }).notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  used: boolean("used").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// ─── RESCHEDULE REQUESTS (from client portal) ────────────────────────────────
export const rescheduleRequests = mysqlTable("reschedule_requests", {
  id: int("id").autoincrement().primaryKey(),
  meetingId: int("meetingId").notNull(),
  leadId: int("leadId").notNull(),
  suggestedTime1: timestamp("suggestedTime1").notNull(),
  suggestedTime2: timestamp("suggestedTime2"),
  suggestedTime3: timestamp("suggestedTime3"),
  clientMessage: text("clientMessage"),
  status: mysqlEnum("rescheduleStatus", ["pending", "accepted", "declined"]).default("pending").notNull(),
  reviewedAt: timestamp("reviewedAt"),
  reviewedBy: varchar("reviewedBy", { length: 255 }),
  notifiedAt: timestamp("notifiedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
// --- OWNER-INITIATED RESCHEDULE PROPOSALS ---
export const ownerRescheduleProposals = mysqlTable("owner_reschedule_proposals", {
  id: int("id").autoincrement().primaryKey(),
  meetingId: int("meetingId").notNull(),
  leadId: int("leadId").notNull(),
  proposedTime: timestamp("proposedTime").notNull(),
  note: text("note"),
  confirmToken: varchar("confirmToken", { length: 64 }).notNull(),
  status: mysqlEnum("ownerRescheduleStatus", ["pending", "confirmed", "rejected"]).default("pending").notNull(),
  confirmedAt: timestamp("confirmedAt"),
  rejectedAt: timestamp("rejectedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type OwnerRescheduleProposal = typeof ownerRescheduleProposals.$inferSelect;
export type InsertOwnerRescheduleProposal = typeof ownerRescheduleProposals.$inferInsert;

// --- CREW TIME LOGS ---
export const crewTimeLogs = mysqlTable("crew_time_logs", {
  id: int("id").autoincrement().primaryKey(),
  crewMemberId: int("crewMemberId").notNull(),
  projectId: int("projectId"),
  clockIn: timestamp("clockIn").notNull(),
  clockOut: timestamp("clockOut"),
  hoursWorked: decimal("hoursWorked", { precision: 6, scale: 2 }),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
// --- CREW SET FEES ---
export const crewSetFees = mysqlTable("crew_set_fees", {
  id: int("id").autoincrement().primaryKey(),
  crewMemberId: int("crewMemberId").notNull(),
  projectId: int("projectId"),
  weekStartDate: timestamp("weekStartDate").notNull(),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
// ─── DESIGN IDEA NOTES ──────────────────────────────────────────────────────
export const designIdeaNotes = mysqlTable("design_idea_notes", {
  id: int("id").autoincrement().primaryKey(),
  leadId: int("leadId").notNull(),
  room: varchar("room", { length: 100 }).notNull().default("General"),
  note: text("note"),
  imageUrl: text("imageUrl"),
  imageKey: varchar("imageKey", { length: 500 }),
  linkUrl: text("linkUrl"),
  linkTitle: varchar("linkTitle", { length: 255 }),
  itemType: mysqlEnum("itemType", ["note", "image", "link"]).notNull().default("note"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// --- TYPES ---
export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type Lead = typeof leads.$inferSelect;
export type InsertLead = typeof leads.$inferInsert;
export type Client = typeof clients.$inferSelect;
export type InsertClient = typeof clients.$inferInsert;
export type Vendor = typeof vendors.$inferSelect;
export type InsertVendor = typeof vendors.$inferInsert;
export type VendorDoc = typeof vendorDocs.$inferSelect;
export type Project = typeof projects.$inferSelect;
export type InsertProject = typeof projects.$inferInsert;
export type Milestone = typeof milestones.$inferSelect;
export type Estimate = typeof estimates.$inferSelect;
export type InsertEstimate = typeof estimates.$inferInsert;
export type EstimateLineItem = typeof estimateLineItems.$inferSelect;
export type PurchaseOrder = typeof purchaseOrders.$inferSelect;
export type VendorQuote = typeof vendorQuotes.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type InsertMessage = typeof messages.$inferInsert;
export type Document = typeof documents.$inferSelect;
export type Invoice = typeof invoices.$inferSelect;
export type ScheduleEvent = typeof scheduleEvents.$inferSelect;
export type ProjectType = typeof projectTypes.$inferSelect;
export type AppSetting = typeof appSettings.$inferSelect;
export type DesignIdeaNote = typeof designIdeaNotes.$inferSelect;

// ─── SMS OPT-OUTS (TCPA compliance) ──────────────────────────────────────────
export const smsOptOuts = mysqlTable("sms_opt_outs", {
  phone: varchar("phone", { length: 20 }).primaryKey(),
  optedOutAt: timestamp("opted_out_at").notNull().defaultNow(),
});
export type SmsOptOut = typeof smsOptOuts.$inferSelect;

// ─── INVOICE DOCUMENTS ────────────────────────────────────────────────────────
export const invoiceDocuments = mysqlTable("invoice_documents", {
  id: int("id").autoincrement().primaryKey(),
  invoiceId: int("invoiceId").notNull(),
  leadId: int("leadId"),
  fileKey: varchar("fileKey", { length: 500 }).notNull(),
  fileUrl: text("fileUrl").notNull(),
  filename: varchar("filename", { length: 255 }).notNull(),
  mimeType: varchar("mimeType", { length: 100 }).notNull(),
  fileSize: int("fileSize").notNull(),
  uploadedAt: timestamp("uploadedAt").defaultNow().notNull(),
});
export type InvoiceDocument = typeof invoiceDocuments.$inferSelect;

// ─── MESSAGE SUMMARIES (AI-generated, stored once per message) ────────────────
export const messageSummaries = mysqlTable("message_summaries", {
  id: int("id").autoincrement().primaryKey(),
  messageId: int("messageId").notNull().unique(),
  leadId: int("leadId"),
  summary: text("summary").notNull(),
  generatedAt: timestamp("generatedAt").defaultNow().notNull(),
});
export type MessageSummary = typeof messageSummaries.$inferSelect;

// ─── TASK ASSIGNEES ───────────────────────────────────────────────────────────
export const taskAssignees = mysqlTable("task_assignees", {
  id: int("id").autoincrement().primaryKey(),
  taskId: int("taskId").notNull(),
  assigneeType: mysqlEnum("assigneeType", ["lead", "vendor", "crew", "custom"]).notNull(),
  assigneeId: int("assigneeId"),
  name: varchar("name", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }),
  phone: varchar("phone", { length: 30 }),
  notifiedAt: timestamp("notifiedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type TaskAssignee = typeof taskAssignees.$inferSelect;

// ─── TASK CATEGORIES ─────────────────────────────────────────────────────────
export const taskCategories = mysqlTable("task_categories", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  projectId: int("projectId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type TaskCategory = typeof taskCategories.$inferSelect;

// ─── PROJECT AI SUMMARIES ─────────────────────────────────────────────────────
export const projectSummaries = mysqlTable("project_summaries", {
  id: int("id").autoincrement().primaryKey(),
  projectId: int("projectId").notNull().unique(),
  summary: text("summary").notNull(),
  generatedAt: timestamp("generatedAt").defaultNow().notNull(),
  model: varchar("model", { length: 100 }),
});
export type ProjectSummary = typeof projectSummaries.$inferSelect;

// ─── PROJECT CUSTOM ASSIGNEES ───────────────────────────────────────────────
// Per-project roster of custom contacts saved when first added to a task
export const projectCustomAssignees = mysqlTable("project_custom_assignees", {
  id: int("id").autoincrement().primaryKey(),
  projectId: int("projectId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  email: varchar("email", { length: 320 }),
  phone: varchar("phone", { length: 30 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type ProjectCustomAssignee = typeof projectCustomAssignees.$inferSelect;

// ─── TASK REPLIES ─────────────────────────────────────────────────────────────
// Stores replies to question/follow-up tasks from assignees (via email or SMS)
export const taskReplies = mysqlTable("task_replies", {
  id: int("id").autoincrement().primaryKey(),
  taskId: int("taskId").notNull(),
  projectId: int("projectId").notNull(),
  repliedBy: varchar("repliedBy", { length: 255 }).notNull(),   // name of replier
  replyChannel: mysqlEnum("replyChannel", ["email", "sms", "portal", "manual"]).default("manual").notNull(),
  replyText: text("replyText").notNull(),
  rawPayload: json("rawPayload"),                                // original webhook payload for audit
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type TaskReply = typeof taskReplies.$inferSelect;

// ─── FIELD CAPTURES ──────────────────────────────────────────────────────────
// Photos and notes captured in the field by the owner, linked to a client/lead
export const fieldCaptures = mysqlTable("field_captures", {
  id: int("id").autoincrement().primaryKey(),
  clientId: int("clientId"),          // references clients.id (may be null if lead-only)
  leadId: int("leadId"),              // references leads.id (for pre-client leads)
  type: mysqlEnum("type", ["photo", "note"]).notNull(),
  photoUrl: text("photoUrl"),         // S3 CDN URL for photos
  photoKey: varchar("photoKey", { length: 512 }), // S3 key for deletion
  noteText: text("noteText"),         // typed or voice-transcribed note
  latitude: decimal("latitude", { precision: 10, scale: 7 }),
  longitude: decimal("longitude", { precision: 10, scale: 7 }),
  clientVisible: tinyint("clientVisible").default(0).notNull(), // 1 = visible to client in portal
  capturedAt: timestamp("capturedAt").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type FieldCapture = typeof fieldCaptures.$inferSelect;
export type InsertFieldCapture = typeof fieldCaptures.$inferInsert;

// ─── PROPOSAL ATTACHMENTS ────────────────────────────────────────────────────
// Photos/files attached to a proposal — from field capture library or direct upload
export const proposalAttachments = mysqlTable("proposal_attachments", {
  id: int("id").autoincrement().primaryKey(),
  estimateId: int("estimateId").notNull(),
  lineItemId: int("lineItemId"),  // null = estimate-level attachment, non-null = line-item-level
  fieldCaptureId: int("fieldCaptureId"),  // null = direct upload (not from field capture)
  fileUrl: text("fileUrl").notNull(),
  fileKey: varchar("fileKey", { length: 512 }),
  fileName: varchar("fileName", { length: 255 }),
  clientVisible: tinyint("clientVisible").default(1).notNull(), // 1 = show to client in portal + PDF
  sortOrder: int("sortOrder").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type ProposalAttachment = typeof proposalAttachments.$inferSelect;
export type InsertProposalAttachment = typeof proposalAttachments.$inferInsert;

// ─── RFI (REQUEST FOR INFORMATION) ───────────────────────────────────────────
// Formal information requests sent to clients with AI-generated content,
// automated 24-hour reminders (max 5), and a token-based client response form.
export const rfis = mysqlTable("rfis", {
  id: int("id").autoincrement().primaryKey(),
  projectId: int("projectId").notNull(),
  clientId: int("clientId"),
  token: varchar("token", { length: 64 }).notNull().unique(),
  title: varchar("title", { length: 255 }).notNull(),
  body: text("body").notNull(),
  attachmentUrls: text("attachmentUrls"),  // JSON: [{url, name}]
  status: mysqlEnum("rfiStatus", ["draft", "sent", "returned", "reviewed", "expired"]).default("draft").notNull(),
  reminderCount: int("reminderCount").default(0).notNull(),
  nextReminderAt: timestamp("nextReminderAt"),
  sentAt: timestamp("sentAt"),
  responseAgreed: tinyint("responseAgreed"),
  responseComments: text("responseComments"),
  responseText: text("responseText"),
  responseRequestedMoreTime: tinyint("responseRequestedMoreTime").default(0).notNull(),
  responseDelayDays: int("responseDelayDays"),
  responsePhotosJson: text("responsePhotosJson"),  // JSON: [{url, name}]
  respondedAt: timestamp("respondedAt"),
  reviewedAt: timestamp("reviewedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});
export type Rfi = typeof rfis.$inferSelect;
export type InsertRfi = typeof rfis.$inferInsert;

export const rfiReminders = mysqlTable("rfi_reminders", {
  id: int("id").autoincrement().primaryKey(),
  rfiId: int("rfiId").notNull(),
  reminderNumber: int("reminderNumber").notNull(),
  channel: mysqlEnum("rfiReminderChannel", ["email", "sms"]).notNull(),
  sentAt: timestamp("sentAt").defaultNow().notNull(),
});
export type RfiReminder = typeof rfiReminders.$inferSelect;
export type InsertRfiReminder = typeof rfiReminders.$inferInsert;

// ── RFI Thread (email conversation chain per RFI) ─────────────────────────────
export const rfiThreads = mysqlTable("rfi_threads", {
  id: int("id").autoincrement().primaryKey(),
  rfiId: int("rfiId").notNull(),
  projectId: int("projectId").notNull(),
  direction: mysqlEnum("rfiThreadDirection", ["outbound", "inbound"]).notNull().default("outbound"),
  senderName: varchar("senderName", { length: 255 }),
  senderEmail: varchar("senderEmail", { length: 255 }),
  subject: varchar("subject", { length: 500 }),
  body: text("body").notNull(),
  gmailMessageId: varchar("gmailMessageId", { length: 255 }),
  gmailThreadId: varchar("gmailThreadId", { length: 255 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type RfiThread = typeof rfiThreads.$inferSelect;
export type InsertRfiThread = typeof rfiThreads.$inferInsert;

// ── RFI Thread Attachments ────────────────────────────────────────────────────
export const rfiThreadAttachments = mysqlTable("rfi_thread_attachments", {
  id: int("id").autoincrement().primaryKey(),
  rfiThreadId: int("rfiThreadId").notNull(),
  rfiId: int("rfiId").notNull(),
  projectId: int("projectId").notNull(),
  fileName: varchar("fileName", { length: 500 }).notNull(),
  fileUrl: varchar("fileUrl", { length: 2000 }).notNull(),
  fileKey: varchar("fileKey", { length: 1000 }).notNull(),
  mimeType: varchar("mimeType", { length: 255 }),
  fileSize: int("fileSize"),
  uploadedBy: varchar("uploadedBy", { length: 255 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type RfiThreadAttachment = typeof rfiThreadAttachments.$inferSelect;
export type InsertRfiThreadAttachment = typeof rfiThreadAttachments.$inferInsert;

// ── Change Orders ─────────────────────────────────────────────────────────────
export const changeOrders = mysqlTable("change_orders", {
  id: int("id").autoincrement().primaryKey(),
  projectId: int("projectId").notNull(),
  rfiId: int("rfiId"),
  changeOrderNumber: varchar("changeOrderNumber", { length: 50 }).notNull(),
  title: varchar("title", { length: 500 }).notNull(),
  description: text("description"),
  lineItemsJson: text("lineItemsJson"),
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull().default("0.00"),
  status: mysqlEnum("status", ["draft", "sent", "approved", "rejected", "voided"]).notNull().default("draft"),
  approvalToken: varchar("approvalToken", { length: 128 }).notNull(),
  sentAt: timestamp("sentAt"),
  approvedAt: timestamp("approvedAt"),
  approvedBy: varchar("approvedBy", { length: 255 }),
  approvalMethod: mysqlEnum("approvalMethod", ["email_link", "portal", "email_reply", "manual"]),
  notes: text("notes"),
  signatureDataUrl: text("signatureDataUrl"),
  signerName: varchar("signerName", { length: 255 }),
  signerIp: varchar("signerIp", { length: 64 }),
  signedAt: timestamp("signedAt"),
  signedPdfUrl: text("signedPdfUrl"),
  signedPdfKey: text("signedPdfKey"),
  declineReason: text("declineReason"),
  declinedAt: timestamp("declinedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});
export type ChangeOrder = typeof changeOrders.$inferSelect;
export type InsertChangeOrder = typeof changeOrders.$inferInsert;

// ── VMS SUPERPOWER ADDITIONS ──────────────────────────────────────────────────

// SP3 — Vendor Portal Sessions (magic-link / phone-based auth)
export const vendorPortalSessions = mysqlTable("vendor_portal_sessions", {
  id: int("id").autoincrement().primaryKey(),
  vendorId: int("vendorId").notNull(),
  token: varchar("token", { length: 128 }).notNull().unique(),
  expiresAt: timestamp("expiresAt").notNull(),
  usedAt: timestamp("usedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type VendorPortalSession = typeof vendorPortalSessions.$inferSelect;

// SP4 — RFQs (Request for Quote)
export const rfqs = mysqlTable("rfqs", {
  id: int("id").autoincrement().primaryKey(),
  projectId: int("projectId").notNull(),
  title: varchar("title", { length: 500 }).notNull(),
  scopeOfWork: text("scopeOfWork"),
  status: mysqlEnum("status", ["draft", "sent", "closed", "awarded"]).notNull().default("draft"),  // DB column is 'status'
  createdBy: int("createdBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type Rfq = typeof rfqs.$inferSelect;

// SP4 — RFQ Invitations (per-vendor bid responses)
export const rfqInvitations = mysqlTable("rfq_invitations", {
  id: int("id").autoincrement().primaryKey(),
  rfqId: int("rfqId").notNull(),
  vendorId: int("vendorId").notNull(),
  status: mysqlEnum("status", ["invited", "quoted", "passed", "awarded"]).notNull().default("invited"),  // DB column is 'status'
  quotedAmount: decimal("quotedAmount", { precision: 12, scale: 2 }),
  quotedLeadTimeDays: int("quotedLeadTimeDays"),
  vendorNotes: text("vendorNotes"),
  respondedAt: timestamp("respondedAt"),
  sentAt: timestamp("sentAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type RfqInvitation = typeof rfqInvitations.$inferSelect;

// SP3 — Vendor Invoice Submissions (against a PO)
export const vendorInvoices = mysqlTable("vendor_invoices", {
  id: int("id").autoincrement().primaryKey(),
  vendorId: int("vendorId").notNull(),
  poId: int("poId").notNull(),
  projectId: int("projectId"),
  invoiceNumber: varchar("invoiceNumber", { length: 100 }),
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  fileUrl: text("fileUrl"),
  fileKey: varchar("fileKey", { length: 512 }),
  status: mysqlEnum("status", ["submitted", "approved", "rejected", "paid"]).notNull().default("submitted"),
  notes: text("notes"),
  submittedAt: timestamp("submittedAt").defaultNow().notNull(),
  reviewedAt: timestamp("reviewedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type VendorInvoice = typeof vendorInvoices.$inferSelect;

// ─── SUBCONTRACTORS ───────────────────────────────────────────────────────────
export const subcontractors = mysqlTable("subcontractors", {
  id: int("id").autoincrement().primaryKey(),
  companyName: varchar("companyName", { length: 255 }).notNull(),
  contactName: varchar("contactName", { length: 255 }),
  email: varchar("email", { length: 320 }),
  phone: varchar("phone", { length: 30 }),
  trade: varchar("trade", { length: 100 }),
  licenseNumber: varchar("licenseNumber", { length: 100 }),
  address: varchar("address", { length: 512 }),
  notes: text("notes"),
  isActive: boolean("isActive").default(true),
  complianceStatus: mysqlEnum("complianceStatus", ["compliant", "expiring_soon", "expired", "missing", "pending"]).default("pending"),
  lastComplianceCheckAt: timestamp("lastComplianceCheckAt"),
  performanceScore: decimal("performanceScore", { precision: 3, scale: 1 }),
  onTimePercentage: decimal("onTimePercentage", { precision: 5, scale: 2 }),
  qualityScore: decimal("qualityScore", { precision: 3, scale: 1 }),
  responsivenessScore: decimal("responsivenessScore", { precision: 3, scale: 1 }),
  tier: mysqlEnum("tier", ["elite", "preferred", "standard", "do_not_use"]),
  lastScorecardAt: timestamp("lastScorecardAt"),
  completedTaskCount: int("completedTaskCount").default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type Subcontractor = typeof subcontractors.$inferSelect;

// ─── SUBCONTRACTOR COMPLIANCE DOCS ────────────────────────────────────────────
export const subcontractorDocs = mysqlTable("subcontractor_docs", {
  id: int("id").autoincrement().primaryKey(),
  subcontractorId: int("subcontractorId").notNull(),
  docType: mysqlEnum("docType", ["coi", "workers_comp", "license", "w9", "other"]).notNull(),
  fileName: varchar("fileName", { length: 255 }),
  fileUrl: text("fileUrl"),
  fileKey: varchar("fileKey", { length: 512 }),
  expiryDate: timestamp("expiryDate"),
  status: mysqlEnum("status", ["pending", "approved", "expired", "rejected"]).default("pending"),
  notes: text("notes"),
  uploadedAt: timestamp("uploadedAt").defaultNow().notNull(),
  reviewedAt: timestamp("reviewedAt"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type SubcontractorDoc = typeof subcontractorDocs.$inferSelect;

// ─── SUBCONTRACTOR CONTRACTS (per-task) ───────────────────────────────────────
export const subcontractorContracts = mysqlTable("subcontractor_contracts", {
  id: int("id").autoincrement().primaryKey(),
  subcontractorId: int("subcontractorId").notNull(),
  projectId: int("projectId").notNull(),
  taskId: int("taskId"),
  contractNumber: varchar("contractNumber", { length: 50 }),
  title: varchar("title", { length: 255 }).notNull(),
  scopeOfWork: text("scopeOfWork"),
  contractAmount: decimal("contractAmount", { precision: 12, scale: 2 }),
  paymentTerms: mysqlEnum("paymentTerms", ["full_on_completion", "deposit_then_completion", "custom"]).default("full_on_completion"),
  paymentTermsNotes: text("paymentTermsNotes"),
  depositPercent: decimal("depositPercent", { precision: 5, scale: 2 }).default("0.00"),
  depositAmount: decimal("depositAmount", { precision: 12, scale: 2 }).default("0.00"),
  depositPaidAt: timestamp("depositPaidAt"),
  estimateId: int("estimateId"),
  awardCandidateId: int("awardCandidateId"),
  startDate: timestamp("startDate"),
  endDate: timestamp("endDate"),
  status: mysqlEnum("status", ["draft", "sent", "signed", "voided"]).default("draft"),
  pdfUrl: text("pdfUrl"),
  pdfKey: varchar("pdfKey", { length: 512 }),
  signToken: varchar("signToken", { length: 128 }),
  signedAt: timestamp("signedAt"),
  signerName: varchar("signerName", { length: 255 }),
  signatureDataUrl: text("signatureDataUrl"),
  signedPdfUrl: text("signedPdfUrl"),
  signedPdfKey: varchar("signedPdfKey", { length: 512 }),
  sentAt: timestamp("sentAt"),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type SubcontractorContract = typeof subcontractorContracts.$inferSelect;

// ─── SUBCONTRACTOR PORTAL SESSIONS (magic-link auth) ──────────────────────────
export const subcontractorPortalSessions = mysqlTable("subcontractor_portal_sessions", {
  id: int("id").autoincrement().primaryKey(),
  subcontractorId: int("subcontractorId").notNull(),
  token: varchar("token", { length: 128 }).notNull().unique(),
  expiresAt: timestamp("expiresAt").notNull(),
  usedAt: timestamp("usedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type SubcontractorPortalSession = typeof subcontractorPortalSessions.$inferSelect;

// ─── SUBCONTRACTOR COMMS (SMS + email log) ────────────────────────────────────
export const subcontractorComms = mysqlTable("subcontractor_comms", {
  id: int("id").autoincrement().primaryKey(),
  subcontractorId: int("subcontractorId").notNull(),
  projectId: int("projectId"),
  contractId: int("contractId"),
  direction: mysqlEnum("direction", ["inbound", "outbound"]).notNull(),
  channel: mysqlEnum("channel", ["sms", "email"]).notNull(),
  subject: varchar("subject", { length: 500 }),
  body: text("body").notNull(),
  fromPhone: varchar("fromPhone", { length: 30 }),
  toPhone: varchar("toPhone", { length: 30 }),
  fromEmail: varchar("fromEmail", { length: 320 }),
  toEmail: varchar("toEmail", { length: 320 }),
  status: mysqlEnum("status", ["sent", "delivered", "failed", "received"]).default("sent"),
  isRead: boolean("isRead").default(false),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type SubcontractorComm = typeof subcontractorComms.$inferSelect;

// ═══════════════════════════════════════════════════════════════════════════════
// AI AGENT SYSTEM — PHASE 1 FOUNDATION
// ═══════════════════════════════════════════════════════════════════════════════

// ─── DOMAIN EVENTS (event bus persistence) ────────────────────────────────────
export const domainEvents = mysqlTable("domain_events", {
  id:          int("id").autoincrement().primaryKey(),
  eventName:   varchar("eventName", { length: 100 }).notNull(),
  entityType:  varchar("entityType", { length: 50 }),
  entityId:    int("entityId"),
  payload:     text("payload"),           // JSON blob
  processedAt: timestamp("processedAt"),  // null = unprocessed
  createdAt:   timestamp("createdAt").defaultNow().notNull(),
});
export type DomainEvent = typeof domainEvents.$inferSelect;
export type InsertDomainEvent = typeof domainEvents.$inferInsert;

// ─── APPROVAL QUEUE (human approval surface) ──────────────────────────────────
export const approvalQueue = mysqlTable("approval_queue", {
  id:             int("id").autoincrement().primaryKey(),
  agentName:      varchar("agentName", { length: 100 }).notNull(),
  actionType:     varchar("actionType", { length: 100 }).notNull(),
  entityType:     varchar("entityType", { length: 50 }),
  entityId:       int("entityId"),
  title:          varchar("title", { length: 500 }).notNull(),
  description:    text("description"),
  severity:       mysqlEnum("severity", ["info", "warning", "critical"]).default("warning").notNull(),
  status:         mysqlEnum("status", ["pending", "approved", "rejected", "auto_resolved"]).default("pending").notNull(),
  payload:        text("payload"),        // JSON: context for the approver
  resolvedBy:     int("resolvedBy"),      // users.id
  resolvedAt:     timestamp("resolvedAt"),
  resolutionNote: text("resolutionNote"),
  expiresAt:      timestamp("expiresAt"),
  createdAt:      timestamp("createdAt").defaultNow().notNull(),
  updatedAt:      timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type ApprovalQueueItem = typeof approvalQueue.$inferSelect;
export type InsertApprovalQueueItem = typeof approvalQueue.$inferInsert;

// ─── AGENT RUN LOG (execution audit trail) ────────────────────────────────────
export const agentRunLog = mysqlTable("agent_run_log", {
  id:               int("id").autoincrement().primaryKey(),
  agentName:        varchar("agentName", { length: 100 }).notNull(),
  runType:          mysqlEnum("runType", ["scheduled", "triggered", "manual"]).default("scheduled").notNull(),
  status:           mysqlEnum("status", ["running", "completed", "failed", "partial"]).default("running").notNull(),
  entityType:       varchar("entityType", { length: 50 }),
  entityId:         int("entityId"),
  summary:          text("summary"),      // human-readable outcome
  details:          text("details"),      // JSON: full structured output
  alertsCreated:    int("alertsCreated").default(0),
  approvalsCreated: int("approvalsCreated").default(0),
  eventsEmitted:    int("eventsEmitted").default(0),
  durationMs:       int("durationMs"),
  startedAt:        timestamp("startedAt").defaultNow().notNull(),
  completedAt:      timestamp("completedAt"),
});
export type AgentRunLog = typeof agentRunLog.$inferSelect;
export type InsertAgentRunLog = typeof agentRunLog.$inferInsert;

// ─── DOMAIN ALERTS (in-app persistent alert feed) ─────────────────────────────
export const domainAlerts = mysqlTable("domain_alerts", {
  id:          int("id").autoincrement().primaryKey(),
  agentName:   varchar("agentName", { length: 100 }),
  alertType:   varchar("alertType", { length: 100 }).notNull(),
  entityType:  varchar("entityType", { length: 50 }),
  entityId:    int("entityId"),
  title:       varchar("title", { length: 500 }).notNull(),
  body:        text("body"),
  severity:    mysqlEnum("severity", ["info", "warning", "critical"]).default("warning").notNull(),
  status:      mysqlEnum("status", ["active", "dismissed", "resolved"]).default("active").notNull(),
  actionUrl:   varchar("actionUrl", { length: 512 }),
  dismissedAt: timestamp("dismissedAt"),
  resolvedAt:  timestamp("resolvedAt"),
  createdAt:   timestamp("createdAt").defaultNow().notNull(),
  updatedAt:   timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type DomainAlert = typeof domainAlerts.$inferSelect;
export type InsertDomainAlert = typeof domainAlerts.$inferInsert;

// ─── COMPLIANCE CHECKS (per-doc per-subcontractor check results) ──────────────
export const complianceChecks = mysqlTable("compliance_checks", {
  id:              int("id").autoincrement().primaryKey(),
  subcontractorId: int("subcontractorId").notNull(),
  docId:           int("docId"),          // subcontractor_docs.id (null = missing doc check)
  checkType:       mysqlEnum("checkType", ["coi", "workers_comp", "license", "w9", "contract"]).notNull(),
  result:          mysqlEnum("result", ["pass", "warn", "fail", "missing"]).notNull(),
  daysUntilExpiry: int("daysUntilExpiry"), // null if missing or no expiry
  notes:           text("notes"),
  checkedAt:       timestamp("checkedAt").defaultNow().notNull(),
});
export type ComplianceCheck = typeof complianceChecks.$inferSelect;
export type InsertComplianceCheck = typeof complianceChecks.$inferInsert;

// ─── FINANCIAL SNAPSHOTS (per-project budget/payment state history) ──────────
export const financialSnapshots = mysqlTable("financial_snapshots", {
  id:                   int("id").autoincrement().primaryKey(),
  projectId:            int("projectId").notNull(),
  agentRunLogId:        int("agentRunLogId"),
  budgetEstimated:      decimal("budgetEstimated", { precision: 12, scale: 2 }),
  budgetActual:         decimal("budgetActual", { precision: 12, scale: 2 }),
  totalInvoiced:        decimal("totalInvoiced", { precision: 12, scale: 2 }).default("0"),
  totalCollected:       decimal("totalCollected", { precision: 12, scale: 2 }).default("0"),
  totalOverdue:         decimal("totalOverdue", { precision: 12, scale: 2 }).default("0"),
  overdueInvoiceCount:  int("overdueInvoiceCount").default(0),
  unbilledMilestoneCount: int("unbilledMilestoneCount").default(0),
  depositCollected:     boolean("depositCollected").default(false),
  overrunPercent:       decimal("overrunPercent", { precision: 8, scale: 2 }),   // (actual-estimated)/estimated * 100
  financialHealth:      mysqlEnum("financialHealth", ["healthy", "watch", "warning", "critical"]).default("healthy"),
  notes:                text("notes"),
  snapshotAt:           timestamp("snapshotAt").defaultNow().notNull(),
});
export type FinancialSnapshot = typeof financialSnapshots.$inferSelect;
export type InsertFinancialSnapshot = typeof financialSnapshots.$inferInsert;

// ─── PROJECT RISK SCORES (per-project risk dimension scoring) ─────────────────
export const projectRiskScores = mysqlTable("project_risk_scores", {
  id:                   int("id").autoincrement().primaryKey(),
  projectId:            int("projectId").notNull(),
  agentRunLogId:        int("agentRunLogId"),
  // Individual dimension scores (0-100, higher = more risk)
  scheduleRisk:         int("scheduleRisk").default(0),
  communicationRisk:    int("communicationRisk").default(0),
  staleTaskRisk:        int("staleTaskRisk").default(0),
  evidenceRisk:         int("evidenceRisk").default(0),
  subcontractorRisk:    int("subcontractorRisk").default(0),
  budgetRisk:           int("budgetRisk").default(0),
  // Composite score (0-100)
  overallRiskScore:     int("overallRiskScore").default(0),
  riskLevel:            mysqlEnum("riskLevel", ["low", "medium", "high", "critical"]).default("low"),
  topRiskFactor:        varchar("topRiskFactor", { length: 100 }),
  notes:                text("notes"),
  scoredAt:             timestamp("scoredAt").defaultNow().notNull(),
});
export type ProjectRiskScore = typeof projectRiskScores.$inferSelect;
export type InsertProjectRiskScore = typeof projectRiskScores.$inferInsert;

// ─── PROJECT NEXT ACTIONS (Next Action Engine output) ─────────────────────────
export const projectNextActions = mysqlTable("project_next_actions", {
  id:                int("id").autoincrement().primaryKey(),
  projectId:         int("projectId").notNull(),
  primaryAction:     varchar("primaryAction", { length: 200 }).notNull(),
  primaryActionType: varchar("primaryActionType", { length: 80 }).notNull(),
  supportingActions: text("supportingActions"),   // JSON array
  reason:            text("reason").notNull(),
  urgency:           mysqlEnum("urgency", ["low", "medium", "high", "critical"]).notNull().default("medium"),
  confidence:        mysqlEnum("confidence", ["low", "medium", "high"]).notNull().default("medium"),
  requiresApproval:  boolean("requiresApproval").default(false),
  relatedEntities:   text("relatedEntities"),     // JSON array
  rulesVersion:      varchar("rulesVersion", { length: 20 }).default("1.0"),
  computedAt:        timestamp("computedAt").defaultNow().notNull(),
  isStale:           boolean("isStale").default(false),
});
export type ProjectNextAction = typeof projectNextActions.$inferSelect;
export type InsertProjectNextAction = typeof projectNextActions.$inferInsert;

// ─── SUBCONTRACTOR AWARD CANDIDATES ──────────────────────────────────────────
// Created automatically when a proposal is approved, for each line item with a
// subcontractorId assigned. Tracks the award lifecycle from estimation to completion.
export const subcontractorAwardCandidates = mysqlTable("subcontractor_award_candidates", {
  id: int("id").autoincrement().primaryKey(),
  estimateId: int("estimateId").notNull(),
  lineItemId: int("lineItemId").notNull(),
  subcontractorId: int("subcontractorId").notNull(),
  projectId: int("projectId"),
  scopeDescription: text("scopeDescription"),
  agreedAmount: decimal("agreedAmount", { precision: 12, scale: 2 }).default("0.00"),
  status: mysqlEnum("status", ["estimated", "assigned", "awarded", "accepted", "deposit_funded", "complete", "voided"]).notNull().default("estimated"),
  notes: text("notes"),
  awardedAt: timestamp("awardedAt"),
  acceptedAt: timestamp("acceptedAt"),
  contractId: int("contractId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type SubcontractorAwardCandidate = typeof subcontractorAwardCandidates.$inferSelect;
export type InsertSubcontractorAwardCandidate = typeof subcontractorAwardCandidates.$inferInsert;

// ─── MESSAGE PROJECTS (many-to-many: one message can belong to multiple projects) ──
// Allows a single message (e.g., a client portal message that references two jobs)
// to appear in the message thread of each relevant project without duplicating the row.
export const messageProjects = mysqlTable("message_projects", {
  id: int("id").autoincrement().primaryKey(),
  messageId: int("messageId").notNull(),
  projectId: int("projectId").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type MessageProject = typeof messageProjects.$inferSelect;
export type InsertMessageProject = typeof messageProjects.$inferInsert;

// ─── SITE MEETINGS (project-level on-site meetings with clients) ──────────────
export const siteMeetings = mysqlTable("site_meetings", {
  id: int("id").autoincrement().primaryKey(),
  projectId: int("projectId").notNull(),
  clientId: int("clientId"),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  startTime: timestamp("startTime").notNull(),
  endTime: timestamp("endTime").notNull(),
  location: text("location"),
  status: mysqlEnum("siteMeetingStatus", ["scheduled", "completed", "canceled", "rescheduled"]).default("scheduled").notNull(),
  gcalEventId: varchar("gcalEventId", { length: 255 }),
  gcalHtmlLink: varchar("gcalHtmlLink", { length: 1024 }),
  gcalSyncError: text("gcalSyncError"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type SiteMeeting = typeof siteMeetings.$inferSelect;
export type InsertSiteMeeting = typeof siteMeetings.$inferInsert;

// ─── ESTIMATE VERSIONS (proposal version history snapshots) ──────────────────
export const estimateVersions = mysqlTable("estimate_versions", {
  id: int("id").autoincrement().primaryKey(),
  estimateId: int("estimateId").notNull(),
  versionNumber: int("versionNumber").notNull(),
  /** Full snapshot: { header: {...}, lineItems: [...] } */
  snapshot: json("snapshot").notNull(),
  /** What triggered this version: 'manual_save' | 'autosave' | 'send' | 'restore' */
  trigger: varchar("trigger", { length: 50 }).notNull(),
  /** Human-readable label (optional, e.g. "Before send to client") */
  label: varchar("label", { length: 255 }),
  /** Hash of the snapshot content for change detection (avoid duplicate versions) */
  contentHash: varchar("contentHash", { length: 64 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type EstimateVersion = typeof estimateVersions.$inferSelect;
export type InsertEstimateVersion = typeof estimateVersions.$inferInsert;
