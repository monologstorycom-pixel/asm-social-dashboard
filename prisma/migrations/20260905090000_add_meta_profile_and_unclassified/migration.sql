-- AlterTable
ALTER TABLE `social_accounts`
  ADD COLUMN `profile_picture_url` TEXT NULL,
  ADD COLUMN `followers_count` INTEGER UNSIGNED NULL,
  ADD COLUMN `media_count` INTEGER UNSIGNED NULL;

-- AlterTable
ALTER TABLE `content_posts`
  MODIFY `content_pillar` ENUM('unclassified', 'education', 'product', 'comparison', 'inspiration', 'promotion', 'brand') NOT NULL,
  MODIFY `creative_style` ENUM('unclassified', 'editorial_no_box', 'editorial_magazine', 'infographic', 'architectural', 'product_photography') NOT NULL;
