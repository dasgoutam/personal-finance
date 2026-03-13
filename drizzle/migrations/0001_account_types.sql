-- Add account_types table with default types
CREATE TABLE `account_types` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL UNIQUE,
	`category` text NOT NULL,
	`parent_id` integer REFERENCES `account_types`(`id`),
	`is_default` integer DEFAULT false NOT NULL
);
--> statement-breakpoint

-- Seed default types (top-level first, then sub-types)
INSERT INTO `account_types` (`name`, `category`, `parent_id`, `is_default`) VALUES ('Checking', 'asset', null, true);
--> statement-breakpoint
INSERT INTO `account_types` (`name`, `category`, `parent_id`, `is_default`) VALUES ('Equity', 'asset', null, true);
--> statement-breakpoint
INSERT INTO `account_types` (`name`, `category`, `parent_id`, `is_default`) SELECT 'Stocks', 'asset', `id`, true FROM `account_types` WHERE `name` = 'Equity';
--> statement-breakpoint
INSERT INTO `account_types` (`name`, `category`, `parent_id`, `is_default`) SELECT 'ETF', 'asset', `id`, true FROM `account_types` WHERE `name` = 'Equity';
--> statement-breakpoint
INSERT INTO `account_types` (`name`, `category`, `parent_id`, `is_default`) SELECT 'Crypto', 'asset', `id`, true FROM `account_types` WHERE `name` = 'Equity';
--> statement-breakpoint
INSERT INTO `account_types` (`name`, `category`, `parent_id`, `is_default`) VALUES ('Income', 'income', null, true);
--> statement-breakpoint
INSERT INTO `account_types` (`name`, `category`, `parent_id`, `is_default`) VALUES ('Expense', 'expense', null, true);
--> statement-breakpoint
INSERT INTO `account_types` (`name`, `category`, `parent_id`, `is_default`) VALUES ('Liability', 'liability', null, true);
--> statement-breakpoint
INSERT INTO `account_types` (`name`, `category`, `parent_id`, `is_default`) VALUES ('Opening Balance', 'equity', null, true);
--> statement-breakpoint

-- Recreate accounts table: drop type/parent_id, add account_type_id
CREATE TABLE `accounts_new` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`account_type_id` integer NOT NULL REFERENCES `account_types`(`id`),
	`currency` text DEFAULT 'EUR' NOT NULL,
	`description` text,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
DROP TABLE `accounts`;
--> statement-breakpoint
ALTER TABLE `accounts_new` RENAME TO `accounts`;
