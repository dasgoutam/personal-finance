-- Rename account types to better reflect their purpose
UPDATE `account_types` SET `name` = 'Bank' WHERE `name` = 'Checking';
--> statement-breakpoint
UPDATE `account_types` SET `name` = 'Investments' WHERE `name` = 'Equity' AND `parent_id` IS NULL;
