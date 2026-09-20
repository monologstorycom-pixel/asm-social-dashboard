-- Replay-safe, additive operational state only.
ALTER TABLE `content_plan_items`
  ADD COLUMN IF NOT EXISTS `asset_revision` INTEGER UNSIGNED NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS `approved_asset_set_hash` CHAR(64) NULL,
  ADD COLUMN IF NOT EXISTS `approved_candidate` VARCHAR(100) NULL,
  ADD COLUMN IF NOT EXISTS `publisher_retry_key` VARCHAR(191) NULL,
  ADD COLUMN IF NOT EXISTS `publisher_retry_count` INTEGER UNSIGNED NOT NULL DEFAULT 0;

ALTER TABLE `content_plan_assets`
  ADD COLUMN IF NOT EXISTS `revision` INTEGER UNSIGNED NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS `candidate` VARCHAR(100) NOT NULL DEFAULT 'final';

CREATE TABLE IF NOT EXISTS `meta_sync_checkpoints` (
  `account_id` VARCHAR(191) NOT NULL,
  `cursor` TEXT NULL,
  `status` VARCHAR(30) NOT NULL DEFAULT 'pending',
  `processed` INTEGER UNSIGNED NOT NULL DEFAULT 0,
  `imported` INTEGER UNSIGNED NOT NULL DEFAULT 0,
  `skipped` INTEGER UNSIGNED NOT NULL DEFAULT 0,
  `failed` INTEGER UNSIGNED NOT NULL DEFAULT 0,
  `unsupported` INTEGER UNSIGNED NOT NULL DEFAULT 0,
  `started_at` DATETIME(3) NULL,
  `completed_at` DATETIME(3) NULL,
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`account_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `publisher_audits` (
  `id` CHAR(36) NOT NULL,
  `content_plan_id` CHAR(36) NOT NULL,
  `action` VARCHAR(100) NOT NULL,
  `approval_attempt_id` CHAR(36) NULL,
  `asset_revision` INTEGER UNSIGNED NOT NULL,
  `retry_key` VARCHAR(191) NULL,
  `details` JSON NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `publisher_audits_content_plan_id_created_at_idx` (`content_plan_id`, `created_at`),
  PRIMARY KEY (`id`),
  CONSTRAINT `publisher_audits_content_plan_id_fkey` FOREIGN KEY (`content_plan_id`) REFERENCES `content_plan_items` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
