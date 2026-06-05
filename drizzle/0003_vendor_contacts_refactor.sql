-- Drop legacy vendor contact fields and migrate to vendor_contacts table
ALTER TABLE `vendors` DROP COLUMN `contactName`;
ALTER TABLE `vendors` DROP COLUMN `email`;
ALTER TABLE `vendors` DROP COLUMN `phone`;
