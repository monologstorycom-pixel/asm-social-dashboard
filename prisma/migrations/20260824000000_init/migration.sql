CREATE TABLE `social_accounts` (
  `id` CHAR(36) NOT NULL,
  `platform` ENUM('instagram','facebook','tiktok','linkedin','x') NOT NULL,
  `account_name` VARCHAR(150) NOT NULL,
  `username` VARCHAR(100) NOT NULL,
  `platform_account_id` VARCHAR(191) NOT NULL,
  `active` BOOLEAN NOT NULL DEFAULT true,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  UNIQUE INDEX `social_accounts_platform_platform_account_id_key` (`platform`,`platform_account_id`),
  UNIQUE INDEX `social_accounts_platform_username_key` (`platform`,`username`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `content_posts` (
  `id` CHAR(36) NOT NULL,
  `social_account_id` CHAR(36) NOT NULL,
  `title` VARCHAR(191) NOT NULL,
  `caption` TEXT NOT NULL,
  `content_pillar` ENUM('education','product','comparison','inspiration','promotion','brand') NOT NULL,
  `topic` VARCHAR(120) NOT NULL,
  `content_type` ENUM('image','carousel','reel','story','video','text') NOT NULL,
  `creative_style` ENUM('editorial_no_box','editorial_magazine','infographic','architectural','product_photography') NOT NULL,
  `slide_count` INTEGER UNSIGNED NOT NULL DEFAULT 1,
  `status` ENUM('idea','draft','review','approved','scheduled','published','failed') NOT NULL DEFAULT 'idea',
  `instagram_media_id` VARCHAR(191) NULL,
  `public_url` TEXT NULL,
  `published_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  INDEX `content_posts_social_account_id_status_published_at_idx` (`social_account_id`,`status`,`published_at`),
  INDEX `content_posts_content_pillar_creative_style_content_type_idx` (`content_pillar`,`creative_style`,`content_type`),
  INDEX `content_posts_topic_idx` (`topic`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `post_assets` (
  `id` CHAR(36) NOT NULL,
  `content_post_id` CHAR(36) NOT NULL,
  `asset_type` ENUM('image','video','thumbnail') NOT NULL,
  `slide_number` INTEGER UNSIGNED NOT NULL,
  `asset_url` TEXT NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `post_assets_content_post_id_slide_number_key` (`content_post_id`,`slide_number`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `post_metrics` (
  `id` CHAR(36) NOT NULL,
  `content_post_id` CHAR(36) NOT NULL,
  `captured_at` DATETIME(3) NOT NULL,
  `reach` INTEGER UNSIGNED NOT NULL DEFAULT 0,
  `impressions` INTEGER UNSIGNED NOT NULL DEFAULT 0,
  `views` INTEGER UNSIGNED NOT NULL DEFAULT 0,
  `likes` INTEGER UNSIGNED NOT NULL DEFAULT 0,
  `comments` INTEGER UNSIGNED NOT NULL DEFAULT 0,
  `saves` INTEGER UNSIGNED NOT NULL DEFAULT 0,
  `shares` INTEGER UNSIGNED NOT NULL DEFAULT 0,
  `engagement_total` INTEGER UNSIGNED NOT NULL,
  `engagement_rate` DECIMAL(10,4) NOT NULL,
  INDEX `post_metrics_captured_at_idx` (`captured_at`),
  UNIQUE INDEX `post_metrics_content_post_id_captured_at_key` (`content_post_id`,`captured_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `content_calendar` (
  `id` CHAR(36) NOT NULL,
  `content_post_id` CHAR(36) NOT NULL,
  `planned_at` DATETIME(3) NOT NULL,
  `status` ENUM('idea','draft','review','approved','scheduled','published','failed') NOT NULL DEFAULT 'scheduled',
  `notes` TEXT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  UNIQUE INDEX `content_calendar_content_post_id_key` (`content_post_id`),
  INDEX `content_calendar_planned_at_idx` (`planned_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `content_experiments` (
  `id` CHAR(36) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `hypothesis` TEXT NOT NULL,
  `experiment_type` VARCHAR(100) NOT NULL,
  `started_at` DATETIME(3) NULL,
  `ended_at` DATETIME(3) NULL,
  `status` ENUM('draft','running','completed','cancelled') NOT NULL DEFAULT 'draft',
  `notes` TEXT NULL,
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `experiment_posts` (
  `experiment_id` CHAR(36) NOT NULL,
  `content_post_id` CHAR(36) NOT NULL,
  INDEX `experiment_posts_content_post_id_idx` (`content_post_id`),
  PRIMARY KEY (`experiment_id`,`content_post_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `content_posts` ADD CONSTRAINT `content_posts_social_account_id_fkey` FOREIGN KEY (`social_account_id`) REFERENCES `social_accounts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `post_assets` ADD CONSTRAINT `post_assets_content_post_id_fkey` FOREIGN KEY (`content_post_id`) REFERENCES `content_posts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `post_metrics` ADD CONSTRAINT `post_metrics_content_post_id_fkey` FOREIGN KEY (`content_post_id`) REFERENCES `content_posts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `content_calendar` ADD CONSTRAINT `content_calendar_content_post_id_fkey` FOREIGN KEY (`content_post_id`) REFERENCES `content_posts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `experiment_posts` ADD CONSTRAINT `experiment_posts_experiment_id_fkey` FOREIGN KEY (`experiment_id`) REFERENCES `content_experiments`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `experiment_posts` ADD CONSTRAINT `experiment_posts_content_post_id_fkey` FOREIGN KEY (`content_post_id`) REFERENCES `content_posts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TRIGGER `post_metrics_no_update` BEFORE UPDATE ON `post_metrics` FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'post_metrics snapshots are immutable';
