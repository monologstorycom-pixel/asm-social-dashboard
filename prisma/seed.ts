import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient, type Prisma } from "../src/generated/prisma/client";

if (process.env.NODE_ENV === "production") throw new Error("Development seed is disabled in production");
const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is required for seed");
const prisma = new PrismaClient({ adapter: new PrismaMariaDb(url) });

const accountIds = [
  "a1111111-1111-4111-8111-111111111111",
  "a2222222-2222-4222-8222-222222222222",
  "a3333333-3333-4333-8333-333333333333",
];
const postIds = Array.from({ length: 10 }, (_, index) => `b${String(index + 1).padStart(7, "0")}-1111-4111-8111-111111111111`);

async function main() {
  const accounts = [
    { id: accountIds[0], platform: "instagram" as const, accountName: "ASM Instagram", username: "asm.official", platformAccountId: "ig-asm-001", active: true },
    { id: accountIds[1], platform: "facebook" as const, accountName: "ASM Facebook", username: "asm.indonesia", platformAccountId: "fb-asm-001", active: true },
    { id: accountIds[2], platform: "tiktok" as const, accountName: "ASM TikTok", username: "asm.social", platformAccountId: "tt-asm-001", active: true },
  ];
  for (const account of accounts) await prisma.socialAccount.upsert({ where: { id: account.id }, update: account, create: account });

  const posts = [
    { id: postIds[0], socialAccountId: accountIds[0], title: "5 Tips Strategi Konten", caption: "Lima langkah praktis untuk kalender konten yang konsisten.", contentPillar: "education", topic: "content strategy", contentType: "carousel", creativeStyle: "editorial_magazine", slideCount: 5, status: "published", instagramMediaId: "ig-media-001", publicUrl: "https://example.com/posts/1", publishedAt: new Date("2026-07-05T03:00:00Z") },
    { id: postIds[1], socialAccountId: accountIds[2], title: "Behind the Scene Tim ASM", caption: "Sehari bersama tim kreatif ASM.", contentPillar: "brand", topic: "culture", contentType: "reel", creativeStyle: "product_photography", slideCount: 1, status: "published", instagramMediaId: null, publicUrl: "https://example.com/posts/2", publishedAt: new Date("2026-07-12T11:00:00Z") },
    { id: postIds[2], socialAccountId: accountIds[1], title: "Kisah Mitra Bertumbuh", caption: "Cerita mitra yang tumbuh bersama ASM.", contentPillar: "inspiration", topic: "customer story", contentType: "video", creativeStyle: "editorial_no_box", slideCount: 1, status: "published", instagramMediaId: null, publicUrl: "https://example.com/posts/3", publishedAt: new Date("2026-07-18T04:00:00Z") },
    { id: postIds[3], socialAccountId: accountIds[0], title: "Promo Kemerdekaan", caption: "Rayakan Agustus dengan penawaran khusus.", contentPillar: "promotion", topic: "campaign", contentType: "image", creativeStyle: "product_photography", slideCount: 1, status: "published", instagramMediaId: "ig-media-004", publicUrl: "https://example.com/posts/4", publishedAt: new Date("2026-08-01T03:00:00Z") },
    { id: postIds[4], socialAccountId: accountIds[2], title: "Mitos vs Fakta Sosial Media", caption: "Mitos yang masih sering dipercaya marketer.", contentPillar: "comparison", topic: "social media", contentType: "reel", creativeStyle: "infographic", slideCount: 1, status: "published", instagramMediaId: null, publicUrl: "https://example.com/posts/5", publishedAt: new Date("2026-08-08T12:00:00Z") },
    { id: postIds[5], socialAccountId: accountIds[0], title: "Checklist Launch Campaign", caption: "Checklist sebelum campaign diluncurkan.", contentPillar: "education", topic: "launch", contentType: "carousel", creativeStyle: "architectural", slideCount: 4, status: "published", instagramMediaId: "ig-media-006", publicUrl: "https://example.com/posts/6", publishedAt: new Date("2026-08-12T03:00:00Z") },
    { id: postIds[6], socialAccountId: accountIds[1], title: "Produk untuk Tim Modern", caption: "Cara produk ASM membantu kerja lintas fungsi.", contentPillar: "product", topic: "productivity", contentType: "image", creativeStyle: "editorial_no_box", slideCount: 1, status: "published", instagramMediaId: null, publicUrl: "https://example.com/posts/7", publishedAt: new Date("2026-08-16T05:00:00Z") },
    { id: postIds[7], socialAccountId: accountIds[2], title: "Brand Story dalam 30 Detik", caption: "Menceritakan nilai merek secara ringkas.", contentPillar: "brand", topic: "brand story", contentType: "video", creativeStyle: "editorial_magazine", slideCount: 1, status: "published", instagramMediaId: null, publicUrl: "https://example.com/posts/8", publishedAt: new Date("2026-08-20T10:00:00Z") },
    { id: postIds[8], socialAccountId: accountIds[0], title: "Kalender September", caption: "Rencana konten bulan depan.", contentPillar: "education", topic: "planning", contentType: "carousel", creativeStyle: "architectural", slideCount: 3, status: "scheduled", instagramMediaId: null, publicUrl: null, publishedAt: null },
    { id: postIds[9], socialAccountId: accountIds[1], title: "Konsep Perbandingan Baru", caption: "Draft konsep perbandingan fitur.", contentPillar: "comparison", topic: "features", contentType: "image", creativeStyle: "infographic", slideCount: 1, status: "draft", instagramMediaId: null, publicUrl: null, publishedAt: null },
  ] satisfies Prisma.ContentPostCreateManyInput[];
  for (const post of posts) await prisma.contentPost.upsert({ where: { id: post.id }, update: post, create: post });

  const assets = posts.flatMap((post, postIndex) => Array.from({ length: post.slideCount }, (_, slideIndex) => ({
    id: `c${String(postIndex + 1).padStart(3, "0")}${String(slideIndex + 1).padStart(4, "0")}-1111-4111-8111-111111111111`,
    contentPostId: post.id,
    assetType: post.contentType === "video" || post.contentType === "reel" ? "video" as const : "image" as const,
    slideNumber: slideIndex + 1,
    assetUrl: `https://placehold.co/1080x1080/png?text=Post+${postIndex + 1}+Slide+${slideIndex + 1}`,
  })));
  await prisma.postAsset.createMany({ skipDuplicates: true, data: assets });

  const metricRows = posts.slice(0, 8).flatMap((post, postIndex) => [0, 1, 2].map((captureIndex) => {
    const scale = (postIndex + 2) * (captureIndex + 1);
    const reach = scale * 900;
    const likes = scale * 75;
    const comments = scale * 8;
    const saves = scale * 18;
    const shares = scale * 12;
    const engagementTotal = likes + comments + saves + shares;
    return {
      id: `d${postIndex + 1}${captureIndex + 1}11111-1111-4111-8111-111111111111`, contentPostId: post.id,
      capturedAt: new Date(Date.UTC(2026, 7, 21 + captureIndex)), reach, impressions: scale * 1300,
      views: post.contentType === "reel" || post.contentType === "video" ? scale * 700 : scale * 300,
      likes, comments, saves, shares, engagementTotal, engagementRate: (engagementTotal / reach) * 100,
    };
  }));
  await prisma.postMetric.createMany({ skipDuplicates: true, data: metricRows });

  await prisma.contentCalendar.upsert({
    where: { contentPostId: postIds[8] },
    update: { plannedAt: new Date("2026-09-01T03:00:00Z"), status: "scheduled", notes: "September launch plan" },
    create: { id: "e1111111-1111-4111-8111-111111111111", contentPostId: postIds[8], plannedAt: new Date("2026-09-01T03:00:00Z"), status: "scheduled", notes: "September launch plan" },
  });
  const experimentId = "f1111111-1111-4111-8111-111111111111";
  await prisma.contentExperiment.upsert({
    where: { id: experimentId }, update: {},
    create: { id: experimentId, name: "Hook edukasi A/B", hypothesis: "Hook berbasis pertanyaan meningkatkan reach.", experimentType: "creative_ab", status: "running", startedAt: new Date("2026-08-01T00:00:00Z"), notes: "Compare two published variants" },
  });
  await prisma.experimentPost.createMany({ skipDuplicates: true, data: [{ experimentId, contentPostId: postIds[0] }, { experimentId, contentPostId: postIds[4] }] });
}

main().finally(() => prisma.$disconnect());
