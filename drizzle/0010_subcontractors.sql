-- ─── SUBCONTRACTORS ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `subcontractors` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `companyName` varchar(255) NOT NULL,
  `contactName` varchar(255),
  `email` varchar(320),
  `phone` varchar(30),
  `trade` varchar(100),
  `licenseNumber` varchar(100),
  `address` varchar(512),
  `notes` text,
  `isActive` boolean DEFAULT true,
  `subComplianceStatus` enum('compliant','expiring_soon','expired','missing','pending') DEFAULT 'pending',
  `lastComplianceCheckAt` timestamp,
  `subPerfScore` decimal(3,1),
  `completedTaskCount` int DEFAULT 0,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- ─── SUBCONTRACTOR COMPLIANCE DOCS ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `subcontractor_docs` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `subcontractorId` int NOT NULL,
  `subDocType` enum('coi','workers_comp','license','w9','other') NOT NULL,
  `fileName` varchar(255),
  `fileUrl` text,
  `fileKey` varchar(512),
  `expiryDate` timestamp,
  `subDocStatus` enum('pending','approved','expired','rejected') DEFAULT 'pending',
  `notes` text,
  `uploadedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `reviewedAt` timestamp,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- ─── SUBCONTRACTOR CONTRACTS ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `subcontractor_contracts` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `subcontractorId` int NOT NULL,
  `projectId` int NOT NULL,
  `taskId` int,
  `contractNumber` varchar(50),
  `title` varchar(255) NOT NULL,
  `scopeOfWork` text,
  `contractAmount` decimal(12,2),
  `startDate` timestamp,
  `endDate` timestamp,
  `subContractStatus` enum('draft','sent','signed','voided') DEFAULT 'draft',
  `pdfUrl` text,
  `pdfKey` varchar(512),
  `signToken` varchar(128),
  `signedAt` timestamp,
  `signerName` varchar(255),
  `signatureDataUrl` text,
  `signedPdfUrl` text,
  `signedPdfKey` varchar(512),
  `sentAt` timestamp,
  `notes` text,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- ─── SUBCONTRACTOR PORTAL SESSIONS ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `subcontractor_portal_sessions` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `subcontractorId` int NOT NULL,
  `token` varchar(128) NOT NULL UNIQUE,
  `expiresAt` timestamp NOT NULL,
  `usedAt` timestamp,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ─── SUBCONTRACTOR COMMS ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `subcontractor_comms` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `subcontractorId` int NOT NULL,
  `projectId` int,
  `contractId` int,
  `subCommDirection` enum('inbound','outbound') NOT NULL,
  `subCommChannel` enum('sms','email') NOT NULL,
  `subject` varchar(500),
  `body` text NOT NULL,
  `fromPhone` varchar(30),
  `toPhone` varchar(30),
  `fromEmail` varchar(320),
  `toEmail` varchar(320),
  `subCommStatus` enum('sent','delivered','failed','received') DEFAULT 'sent',
  `isRead` boolean DEFAULT false,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);
