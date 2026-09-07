ALTER TABLE `content_plan_items` MODIFY `publisher_state` ENUM('idle','ready','scheduled','publishing','published','failed') NOT NULL DEFAULT 'idle';
ALTER TABLE `content_plan_items` ADD COLUMN IF NOT EXISTS `auto_approval_status` VARCHAR(50) NULL;
ALTER TABLE `content_plan_items` ADD COLUMN IF NOT EXISTS `schedule_reason` TEXT NULL;
ALTER TABLE `content_plan_items` ADD COLUMN IF NOT EXISTS `schedule_data_mode` VARCHAR(50) NULL;
ALTER TABLE `content_plan_items` ADD COLUMN IF NOT EXISTS `schedule_confidence` VARCHAR(50) NULL;
ALTER TABLE `content_plan_items` ADD COLUMN IF NOT EXISTS `schedule_sample_count` INT UNSIGNED NOT NULL DEFAULT 0;
ALTER TABLE `content_plan_items` ADD COLUMN IF NOT EXISTS `publisher_lease_id` CHAR(36) NULL;
ALTER TABLE `content_plan_items` ADD COLUMN IF NOT EXISTS `publisher_lease_until` DATETIME(3) NULL;
CREATE INDEX IF NOT EXISTS `content_plan_items_publisher_lease_until_idx` ON `content_plan_items`(`publisher_lease_until`);
