CREATE TABLE `app_settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`key` varchar(100) NOT NULL,
	`value` text,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `app_settings_id` PRIMARY KEY(`id`),
	CONSTRAINT `app_settings_key_unique` UNIQUE(`key`)
);
--> statement-breakpoint
CREATE TABLE `automation_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`triggerType` varchar(100) NOT NULL,
	`entityType` varchar(50),
	`entityId` int,
	`status` enum('success','failed','skipped') NOT NULL,
	`details` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `automation_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `clients` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int,
	`name` varchar(255) NOT NULL,
	`email` varchar(320),
	`phone` varchar(20),
	`address` text,
	`notes` text,
	`magicLinkToken` varchar(128),
	`magicLinkExpiry` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `clients_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `crew_members` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int,
	`name` varchar(255) NOT NULL,
	`email` varchar(320),
	`phone` varchar(20),
	`role` varchar(100),
	`hourlyRate` decimal(10,2),
	`isActive` boolean DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `crew_members_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `documents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`projectId` int,
	`leadId` int,
	`vendorId` int,
	`clientId` int,
	`uploadedBy` int,
	`docType` enum('estimate','contract','permit','photo','drawing','invoice','warranty','compliance','other') NOT NULL,
	`fileName` varchar(255) NOT NULL,
	`fileUrl` text NOT NULL,
	`fileKey` varchar(512) NOT NULL,
	`mimeType` varchar(100),
	`fileSize` int,
	`roomTag` varchar(100),
	`description` text,
	`version` int DEFAULT 1,
	`isPublic` boolean DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `documents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `estimate_line_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`estimateId` int NOT NULL,
	`description` text NOT NULL,
	`category` varchar(100),
	`quantity` decimal(10,2) DEFAULT '1.00',
	`unit` varchar(50),
	`unitCost` decimal(12,2) DEFAULT '0.00',
	`markupPercent` decimal(5,2) DEFAULT '0.00',
	`unitPrice` decimal(12,2) DEFAULT '0.00',
	`lineTotal` decimal(12,2) DEFAULT '0.00',
	`showMarkup` boolean DEFAULT false,
	`productUrl` text,
	`productSource` varchar(100),
	`imageUrl` text,
	`clientApproved` boolean DEFAULT false,
	`sortOrder` int DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `estimate_line_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `estimates` (
	`id` int AUTO_INCREMENT NOT NULL,
	`projectId` int,
	`leadId` int,
	`clientId` int,
	`estimateNumber` varchar(50),
	`title` varchar(255),
	`status` enum('draft','sent','viewed','approved','rejected','expired') NOT NULL DEFAULT 'draft',
	`subtotal` decimal(12,2) DEFAULT '0.00',
	`taxRate` decimal(5,2) DEFAULT '0.00',
	`taxAmount` decimal(12,2) DEFAULT '0.00',
	`total` decimal(12,2) DEFAULT '0.00',
	`depositPercent` decimal(5,2) DEFAULT '50.00',
	`depositAmount` decimal(12,2) DEFAULT '0.00',
	`notes` text,
	`validUntil` timestamp,
	`approvedAt` timestamp,
	`sentAt` timestamp,
	`pdfUrl` text,
	`pdfKey` varchar(512),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `estimates_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `invoices` (
	`id` int AUTO_INCREMENT NOT NULL,
	`projectId` int NOT NULL,
	`clientId` int,
	`invoiceNumber` varchar(50),
	`invoiceType` enum('deposit','progress','final','change_order') NOT NULL,
	`milestoneId` int,
	`amount` decimal(12,2) NOT NULL,
	`status` enum('draft','sent','paid','overdue','cancelled') NOT NULL DEFAULT 'draft',
	`squarePaymentLinkId` varchar(255),
	`squarePaymentId` varchar(255),
	`dueDate` timestamp,
	`paidAt` timestamp,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `invoices_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `leads` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`email` varchar(320),
	`phone` varchar(20),
	`projectType` varchar(100),
	`budgetMin` decimal(12,2),
	`budgetMax` decimal(12,2),
	`status` enum('new','consultation_scheduled','visited','quoted','won','lost') NOT NULL DEFAULT 'new',
	`source` varchar(100),
	`notes` text,
	`address` text,
	`assignedTo` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `leads_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `messages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`projectId` int,
	`leadId` int,
	`threadType` enum('client','vendor','internal','lead') NOT NULL,
	`direction` enum('inbound','outbound') NOT NULL,
	`channel` enum('sms','email','portal','internal') NOT NULL,
	`fromName` varchar(255),
	`fromPhone` varchar(20),
	`fromEmail` varchar(320),
	`toPhone` varchar(20),
	`toEmail` varchar(320),
	`body` text NOT NULL,
	`twilioSid` varchar(64),
	`status` enum('draft','pending_approval','approved','sent','delivered','failed','received') NOT NULL DEFAULT 'sent',
	`isAiDraft` boolean DEFAULT false,
	`approvedBy` int,
	`approvedAt` timestamp,
	`scheduledFor` timestamp,
	`sentAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `messages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `milestones` (
	`id` int AUTO_INCREMENT NOT NULL,
	`projectId` int NOT NULL,
	`title` varchar(255) NOT NULL,
	`description` text,
	`dueDate` timestamp,
	`completedAt` timestamp,
	`status` enum('pending','in_progress','completed','delayed') DEFAULT 'pending',
	`billingAmount` decimal(12,2),
	`squarePaymentLinkId` varchar(255),
	`squarePaymentStatus` enum('none','pending','paid') DEFAULT 'none',
	`sortOrder` int DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `milestones_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `po_line_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`poId` int NOT NULL,
	`description` text NOT NULL,
	`quantity` decimal(10,2) DEFAULT '1.00',
	`unit` varchar(50),
	`unitCost` decimal(12,2) DEFAULT '0.00',
	`lineTotal` decimal(12,2) DEFAULT '0.00',
	`sortOrder` int DEFAULT 0,
	CONSTRAINT `po_line_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `project_assignments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`projectId` int NOT NULL,
	`assigneeType` enum('crew','vendor') NOT NULL,
	`assigneeId` int NOT NULL,
	`role` varchar(100),
	`startDate` timestamp,
	`endDate` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `project_assignments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `project_types` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(100) NOT NULL,
	`isDefault` boolean DEFAULT false,
	`isActive` boolean DEFAULT true,
	`sortOrder` int DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `project_types_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `projects` (
	`id` int AUTO_INCREMENT NOT NULL,
	`leadId` int,
	`clientId` int,
	`name` varchar(255) NOT NULL,
	`projectType` varchar(100),
	`status` enum('planning','active','on_hold','completed','cancelled') NOT NULL DEFAULT 'planning',
	`address` text,
	`description` text,
	`scopeOfWork` text,
	`startDate` timestamp,
	`estimatedEndDate` timestamp,
	`actualEndDate` timestamp,
	`budgetEstimated` decimal(12,2),
	`budgetActual` decimal(12,2),
	`depositPercent` decimal(5,2) DEFAULT '50.00',
	`squareDepositLinkId` varchar(255),
	`squareDepositStatus` enum('pending','paid','refunded') DEFAULT 'pending',
	`aiUpdateFrequency` enum('daily','every_few_days','weekly','manual') DEFAULT 'weekly',
	`googleReviewSent` boolean DEFAULT false,
	`completionFollowupSent` boolean DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `projects_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `purchase_orders` (
	`id` int AUTO_INCREMENT NOT NULL,
	`projectId` int NOT NULL,
	`vendorId` int,
	`poNumber` varchar(50),
	`title` varchar(255),
	`status` enum('draft','sent','acknowledged','delivered','invoiced','paid','cancelled') NOT NULL DEFAULT 'draft',
	`subtotal` decimal(12,2) DEFAULT '0.00',
	`total` decimal(12,2) DEFAULT '0.00',
	`notes` text,
	`expectedDelivery` timestamp,
	`deliveredAt` timestamp,
	`invoiceUrl` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `purchase_orders_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `schedule_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`projectId` int,
	`title` varchar(255) NOT NULL,
	`eventType` enum('milestone','crew_assignment','vendor_visit','delivery','inspection','consultation','other') NOT NULL,
	`assigneeType` enum('crew','vendor','owner'),
	`assigneeId` int,
	`startTime` timestamp NOT NULL,
	`endTime` timestamp,
	`allDay` boolean DEFAULT false,
	`location` text,
	`notes` text,
	`status` enum('scheduled','confirmed','in_progress','completed','cancelled','rescheduled') DEFAULT 'scheduled',
	`googleEventId` varchar(255),
	`reminderSent24h` boolean DEFAULT false,
	`reminderSentMorning` boolean DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `schedule_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `vendor_docs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`vendorId` int NOT NULL,
	`docType` enum('insurance','license','w9','coi','workers_comp','other') NOT NULL,
	`fileName` varchar(255),
	`fileUrl` text,
	`fileKey` varchar(512),
	`expiryDate` timestamp,
	`isRequired` boolean DEFAULT true,
	`status` enum('pending','approved','expired','rejected') DEFAULT 'pending',
	`uploadedAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `vendor_docs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `vendor_quotes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`projectId` int NOT NULL,
	`vendorId` int NOT NULL,
	`status` enum('requested','submitted','accepted','rejected') NOT NULL DEFAULT 'requested',
	`amount` decimal(12,2),
	`description` text,
	`notes` text,
	`submittedAt` timestamp,
	`validUntil` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `vendor_quotes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `vendors` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int,
	`companyName` varchar(255) NOT NULL,
	`contactName` varchar(255),
	`email` varchar(320),
	`phone` varchar(20),
	`trade` varchar(100),
	`hourlyRate` decimal(10,2),
	`availability` enum('available','busy','unavailable') DEFAULT 'available',
	`performanceScore` decimal(3,1),
	`notes` text,
	`isActive` boolean DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `vendors_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `role` enum('owner','admin','crew','client','vendor','user') NOT NULL DEFAULT 'user';--> statement-breakpoint
ALTER TABLE `users` ADD `phone` varchar(20);