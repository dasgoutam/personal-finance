-- Remove the Investments parent group; make Stocks, ETF, Crypto flat top-level asset types
UPDATE `account_types` SET `parent_id` = NULL WHERE `name` IN ('Stocks', 'ETF', 'Crypto');
--> statement-breakpoint
DELETE FROM `account_types` WHERE `name` = 'Investments' AND `parent_id` IS NULL;
