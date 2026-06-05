-- Migration: Add project_next_actions table for Next Action Engine
CREATE TABLE IF NOT EXISTS `project_next_actions` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `projectId` int NOT NULL,
  `primaryAction` varchar(200) NOT NULL,
  `primaryActionType` varchar(80) NOT NULL,
  `supportingActions` text,
  `reason` text NOT NULL,
  `urgency` enum('low','medium','high','critical') NOT NULL DEFAULT 'medium',
  `confidence` enum('low','medium','high') NOT NULL DEFAULT 'medium',
  `requiresApproval` boolean DEFAULT false,
  `relatedEntities` text,
  `rulesVersion` varchar(20) DEFAULT '1.0',
  `computedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `isStale` boolean DEFAULT false,
  INDEX `idx_pna_project` (`projectId`),
  INDEX `idx_pna_computed` (`computedAt`)
);
