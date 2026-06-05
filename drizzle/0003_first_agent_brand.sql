-- Custom SQL migration file, put your code below! --
-- Add archivedAt column to leads and clients for soft-delete/archive support
ALTER TABLE `leads` ADD COLUMN IF NOT EXISTS `archivedAt` timestamp;--> statement-breakpoint
ALTER TABLE `clients` ADD COLUMN IF NOT EXISTS `archivedAt` timestamp;