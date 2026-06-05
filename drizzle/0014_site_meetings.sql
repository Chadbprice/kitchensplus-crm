-- Migration: Add site_meetings table for project-level on-site meetings
CREATE TABLE `site_meetings` (
  `id` int AUTO_INCREMENT PRIMARY KEY NOT NULL,
  `projectId` int NOT NULL,
  `clientId` int,
  `title` varchar(255) NOT NULL,
  `description` text,
  `startTime` timestamp NOT NULL,
  `endTime` timestamp NOT NULL,
  `location` text,
  `siteMeetingStatus` enum('scheduled','completed','canceled','rescheduled') NOT NULL DEFAULT 'scheduled',
  `gcalEventId` varchar(255),
  `gcalHtmlLink` varchar(1024),
  `gcalSyncError` text,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP
);
