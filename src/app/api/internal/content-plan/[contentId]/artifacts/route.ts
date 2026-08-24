import { artifactSchema } from "@/lib/operations-api";
import { contentIdSchema, contentPlanJson } from "@/lib/content-plan-api";
import { db } from "@/lib/db";
import { HttpError, readJson, safeRoute } from "@/lib/http";
import { authorizeInternalRequest, mapPlanFields } from "@/lib/operations";

type Context = { params: Promise<{ contentId: string }> };

export async function POST(request: Request, context: Context) {
  return safeRoute(async () => {
    authorizeInternalRequest(request);
    const contentId = contentIdSchema.parse((await context.params).contentId);
    const body = artifactSchema.parse(await readJson(request));
    const item = await db.$transaction(async (tx) => {
      const plan = await tx.contentPlanItem.findUnique({ where: { contentId }, include: { assets: true, contentPost: true } });
      if (!plan) throw new HttpError(404, "Content plan item not found");
      if (!(["creating", "ready_for_review"] as string[]).includes(plan.status)) throw new HttpError(409, "Artifacts may only be submitted while creating or ready_for_review");
      const mapped = mapPlanFields(plan);
      const post = plan.contentPostId
        ? await tx.contentPost.update({ where: { id: plan.contentPostId }, data: { socialAccountId: body.socialAccountId, caption: body.caption, title: plan.workingTitle, slideCount: body.assets.length, ...mapped } })
        : await tx.contentPost.create({ data: {
          socialAccountId: body.socialAccountId,
          title: plan.workingTitle,
          caption: body.caption,
          topic: plan.topicTag,
          slideCount: body.assets.length,
          status: "review",
          source: "live",
          ...mapped,
        } });
      for (const asset of body.assets) await tx.contentPlanAsset.upsert({
        where: { contentPlanId_slideNumber: { contentPlanId: plan.id, slideNumber: asset.slideNumber } },
        create: { contentPlanId: plan.id, slideNumber: asset.slideNumber, localPath: asset.localPath, publicUrl: asset.publicUrl, sha256: asset.sha256, mimeType: asset.mimeType, assetRole: asset.role, isFinal: asset.final },
        update: { localPath: asset.localPath, publicUrl: asset.publicUrl, sha256: asset.sha256, mimeType: asset.mimeType, assetRole: asset.role, isFinal: asset.final },
      });
      const submittedSlides = body.assets.map(({ slideNumber }) => slideNumber);
      await tx.contentPlanAsset.deleteMany({ where: { contentPlanId: plan.id, slideNumber: { notIn: submittedSlides } } });
      await tx.postAsset.deleteMany({ where: { contentPostId: post.id, slideNumber: { notIn: submittedSlides } } });
      for (const asset of body.assets.filter(({ final }) => final)) await tx.postAsset.upsert({
        where: { contentPostId_slideNumber: { contentPostId: post.id, slideNumber: asset.slideNumber } },
        create: { contentPostId: post.id, slideNumber: asset.slideNumber, assetType: asset.mimeType.toLowerCase().startsWith("video/") ? "video" : "image", assetUrl: asset.publicUrl ?? asset.localPath! },
        update: { assetType: asset.mimeType.toLowerCase().startsWith("video/") ? "video" : "image", assetUrl: asset.publicUrl ?? asset.localPath! },
      });
      const ready = body.qaStatus === "passed" && body.assets.every((asset) => asset.final);
      return tx.contentPlanItem.update({
        where: { id: plan.id },
        data: { contentPostId: post.id, finalCaption: body.caption, finalBrief: body.finalBrief, qaStatus: body.qaStatus, qaResult: body.qaResult, qaNotes: body.qaNotes, status: ready ? "ready_for_review" : "creating" },
        include: { assets: { orderBy: { slideNumber: "asc" } }, contentPost: true },
      });
    });
    return Response.json({ item: contentPlanJson(item) });
  });
}
