-- Add operational provenance and publication linkage without rewriting valid rows.
ALTER TABLE `content_posts`
  ADD COLUMN `permalink` TEXT NULL,
  ADD COLUMN `scheduled_at` DATETIME(3) NULL,
  ADD COLUMN `source` ENUM('demo','live') NOT NULL DEFAULT 'demo',
  ADD UNIQUE INDEX `content_posts_instagram_media_id_key` (`instagram_media_id`);

ALTER TABLE `post_metrics`
  ADD COLUMN `source` ENUM('demo','meta','manual') NOT NULL DEFAULT 'demo',
  ADD COLUMN `snapshot_window` ENUM('h1','h6','h24','h72','d7','ad_hoc') NULL,
  ADD COLUMN `early_engagement_velocity` DECIMAL(14,4) NULL,
  ADD INDEX `post_metrics_content_post_id_source_snapshot_window_idx` (`content_post_id`,`source`,`snapshot_window`);

ALTER TABLE `content_plan_items`
  ADD COLUMN `content_post_id` CHAR(36) NULL,
  ADD COLUMN `final_caption` TEXT NULL,
  ADD COLUMN `final_brief` TEXT NULL,
  ADD COLUMN `qa_status` ENUM('pending','passed','failed') NOT NULL DEFAULT 'pending',
  ADD COLUMN `qa_result` VARCHAR(191) NULL,
  ADD COLUMN `qa_notes` TEXT NULL,
  ADD COLUMN `approved_at` DATETIME(3) NULL,
  ADD COLUMN `approval_command` VARCHAR(50) NULL,
  ADD COLUMN `approval_reference` VARCHAR(191) NULL,
  ADD COLUMN `approval_attempt_id` CHAR(36) NULL,
  ADD COLUMN `approval_version` INTEGER UNSIGNED NOT NULL DEFAULT 0,
  ADD COLUMN `scheduled_at` DATETIME(3) NULL,
  ADD COLUMN `published_at` DATETIME(3) NULL,
  ADD COLUMN `publisher_state` ENUM('idle','ready','scheduled','published','failed') NOT NULL DEFAULT 'idle',
  ADD COLUMN `publisher_error` TEXT NULL,
  ADD UNIQUE INDEX `content_plan_items_content_post_id_key` (`content_post_id`),
  ADD UNIQUE INDEX `content_plan_items_approval_attempt_id_key` (`approval_attempt_id`),
  ADD INDEX `content_plan_items_status_scheduled_at_idx` (`status`,`scheduled_at`),
  ADD CONSTRAINT `content_plan_items_content_post_id_fkey` FOREIGN KEY (`content_post_id`) REFERENCES `content_posts`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `content_plan_schedule_fields_check` CHECK (`status` NOT IN ('scheduled','published','measuring') OR (`approved_at` IS NOT NULL AND `scheduled_at` IS NOT NULL)),
  ADD CONSTRAINT `content_plan_publish_fields_check` CHECK (`status` NOT IN ('published','measuring') OR (`content_post_id` IS NOT NULL AND `published_at` IS NOT NULL)),
  ADD CONSTRAINT `content_plan_approval_command_check` CHECK (`status` NOT IN ('approved','scheduled','published','measuring') OR (`approved_at` IS NOT NULL AND `approval_command` = 'APPROVE & PUBLISH' AND `approval_attempt_id` IS NOT NULL));

CREATE TABLE `content_plan_assets` (
  `id` CHAR(36) NOT NULL,
  `content_plan_id` CHAR(36) NOT NULL,
  `slide_number` INTEGER UNSIGNED NOT NULL,
  `local_path` TEXT NULL,
  `public_url` TEXT NULL,
  `sha256` CHAR(64) NOT NULL,
  `mime_type` VARCHAR(100) NOT NULL,
  `asset_role` VARCHAR(50) NOT NULL,
  `is_final` BOOLEAN NOT NULL DEFAULT true,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `content_plan_assets_content_plan_id_slide_number_key` (`content_plan_id`,`slide_number`),
  INDEX `content_plan_assets_sha256_idx` (`sha256`),
  PRIMARY KEY (`id`),
  CONSTRAINT `content_plan_assets_content_plan_id_fkey` FOREIGN KEY (`content_plan_id`) REFERENCES `content_plan_items`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
