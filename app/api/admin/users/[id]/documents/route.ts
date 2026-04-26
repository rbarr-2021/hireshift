import { NextRequest, NextResponse } from "next/server";
import type { BusinessDocumentRecord, WorkerDocumentRecord } from "@/lib/models";
import { getRouteActor, isAdminUser } from "@/lib/route-access";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AdminDocumentItem = {
  id: string;
  document_type: string;
  file_name: string;
  storage_bucket: string;
  storage_path: string;
  signed_url: string | null;
};

async function withSignedUrl(
  supabaseAdmin: ReturnType<typeof getSupabaseAdminClient>,
  document: WorkerDocumentRecord | BusinessDocumentRecord,
): Promise<AdminDocumentItem> {
  const signedUrlResult = await supabaseAdmin.storage
    .from(document.storage_bucket)
    .createSignedUrl(document.storage_path, 300);

  return {
    id: document.id,
    document_type: document.document_type,
    file_name: document.file_name,
    storage_bucket: document.storage_bucket,
    storage_path: document.storage_path,
    signed_url: signedUrlResult.data?.signedUrl ?? null,
  };
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const actor = await getRouteActor(request);

  if (!actor) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!(await isAdminUser(actor.authUser.id))) {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const { id } = await context.params;

  if (!id) {
    return NextResponse.json({ error: "Missing user id." }, { status: 400 });
  }

  const supabaseAdmin = getSupabaseAdminClient();
  const [workerDocsResult, businessDocsResult] = await Promise.all([
    supabaseAdmin
      .from("worker_documents")
      .select("*")
      .eq("worker_id", id)
      .returns<WorkerDocumentRecord[]>(),
    supabaseAdmin
      .from("business_documents")
      .select("*")
      .eq("business_id", id)
      .returns<BusinessDocumentRecord[]>(),
  ]);

  if (workerDocsResult.error || businessDocsResult.error) {
    return NextResponse.json(
      {
        error:
          workerDocsResult.error?.message ||
          businessDocsResult.error?.message ||
          "Unable to load documents.",
      },
      { status: 400 },
    );
  }

  const workerDocuments = (workerDocsResult.data ?? []).map((document) => ({
    ...document,
    profile_type: "worker" as const,
  }));
  const businessDocuments = (businessDocsResult.data ?? []).map((document) => ({
    ...document,
    profile_type: "business" as const,
  }));

  const documents = await Promise.all(
    [...workerDocuments, ...businessDocuments].map((document) =>
      withSignedUrl(supabaseAdmin, document),
    ),
  );

  return NextResponse.json({ items: documents });
}
