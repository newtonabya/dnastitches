import { type HandleUploadBody, handleUpload } from "@vercel/blob/client";
import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { env } from "@/lib/env";
import { ALLOWED_IMAGE_TYPES, MAX_UPLOAD_BYTES } from "@/lib/uploads";

/**
 * Vercel Blob client-upload token route (US-B1 DoD). Issues a short-lived token only
 * to signed-in users, only for their own path prefix, and only for allowed image
 * types up to 8 MB; Blob enforces those limits on the upload itself.
 */
export async function POST(request: Request): Promise<NextResponse> {
  if (!env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json({ error: "Image uploads aren't configured yet." }, { status: 503 });
  }

  let body: HandleUploadBody;
  try {
    body = (await request.json()) as HandleUploadBody;
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  try {
    const json = await handleUpload({
      body,
      request,
      token: env.BLOB_READ_WRITE_TOKEN,
      onBeforeGenerateToken: async (pathname) => {
        const session = await auth();
        const userId = session?.user?.id;
        if (!userId) throw new UploadAuthError();
        if (!pathname.startsWith(`custom-requests/${userId}/`)) throw new UploadAuthError();
        return {
          allowedContentTypes: [...ALLOWED_IMAGE_TYPES],
          maximumSizeInBytes: MAX_UPLOAD_BYTES,
          addRandomSuffix: true,
          tokenPayload: JSON.stringify({ userId }),
        };
      },
    });
    return NextResponse.json(json);
  } catch (error) {
    const status = error instanceof UploadAuthError ? 401 : 400;
    return NextResponse.json(
      { error: status === 401 ? "Please sign in to upload images." : "Upload failed." },
      { status },
    );
  }
}

class UploadAuthError extends Error {}
