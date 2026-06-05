-- ─── Invoice Schema Sync Migration ────────────────────────────────────────────
-- Adds columns that exist in schema.ts but were never migrated to the database.
-- All statements use IF NOT EXISTS / IF EXISTS guards to be idempotent.

-- 1. Add missing columns to `invoices` table
ALTER TABLE `invoices`
  ADD COLUMN IF NOT EXISTS `leadId`               INT,
  ADD COLUMN IF NOT EXISTS `pdfUrl`               TEXT,
  ADD COLUMN IF NOT EXISTS `pdfKey`               VARCHAR(512),
  ADD COLUMN IF NOT EXISTS `squarePaymentUrl`      TEXT,
  ADD COLUMN IF NOT EXISTS `sentAt`               TIMESTAMP NULL,
  ADD COLUMN IF NOT EXISTS `amountPaid`           DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS `followUpCount`        INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS `lastFollowUpAt`       TIMESTAMP NULL,
  ADD COLUMN IF NOT EXISTS `contractRequired`     TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS `contractSigned`       TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS `contractSignedAt`     TIMESTAMP NULL,
  ADD COLUMN IF NOT EXISTS `contractSignerName`   VARCHAR(255),
  ADD COLUMN IF NOT EXISTS `contractSignedPdfUrl` TEXT,
  ADD COLUMN IF NOT EXISTS `contractSignedPdfKey` VARCHAR(512),
  ADD COLUMN IF NOT EXISTS `contractSignToken`    VARCHAR(128);

-- Also update invoiceType enum to include 'other' if not already present
-- (MySQL requires recreating the column for enum changes — skip if already correct)

-- 2. Create `invoice_payments` table if it doesn't exist
CREATE TABLE IF NOT EXISTS `invoice_payments` (
  `id`              INT AUTO_INCREMENT PRIMARY KEY,
  `invoiceId`       INT NOT NULL,
  `projectId`       INT,
  `leadId`          INT,
  `clientId`        INT,
  `amount`          DECIMAL(12,2) NOT NULL,
  `method`          ENUM('square','check','cash','ach','other') NOT NULL DEFAULT 'square',
  `squarePaymentId` VARCHAR(255),
  `note`            TEXT,
  `paidAt`          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `createdAt`       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
