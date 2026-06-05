-- Add hidePrices column to estimates for controlling client-visible pricing
ALTER TABLE `estimates` ADD COLUMN IF NOT EXISTS `hidePrices` tinyint NOT NULL DEFAULT 0;
