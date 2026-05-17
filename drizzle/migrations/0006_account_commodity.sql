-- Link accounts to a single commodity (for ETF/Stock/Crypto accounts)
ALTER TABLE `accounts` ADD COLUMN `commodity_id` integer REFERENCES `commodities`(`id`);
