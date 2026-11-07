import { CircularService } from "@/modules/circular/application/circular-service";
import { circularActor, circularFailure } from "@/modules/circular/infrastructure/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    circularActor(req); const row = await new CircularService().evidenceFile((await params).id);
    const extension = row.mime === "application/pdf" ? "pdf" : row.mime === "image/png" ? "png" : "jpg";
    return new Response(new Uint8Array(row.content), { headers: { "Content-Type": "application/octet-stream", "Content-Disposition": `attachment; filename="comprovante-${row.id}.${extension}"`, "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "sandbox; default-src 'none'", "Cache-Control": "private, no-store", "X-Document-SHA256": row.sha256 } });
  } catch (error) { return circularFailure(error); }
}
