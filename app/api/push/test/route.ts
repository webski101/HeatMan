import { auth } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";
import {
  getHeatManFirebaseMessaging,
  isFirebaseAdminConfigured,
} from "@/lib/firebase-admin";

export const runtime = "nodejs";

type PushTestBody = {
  installationId?: string;
};

export async function POST(request: Request) {
  const authState = await auth();
  const { userId, orgId } = authState;

  if (!userId || !orgId) {
    return Response.json(
      { message: "Sign in to a HeatMan organization before sending push alerts." },
      { status: 401 },
    );
  }

  if (!isFirebaseAdminConfigured()) {
    return Response.json(
      { message: "Firebase server credentials are not configured yet." },
      { status: 503 },
    );
  }

  const body = (await request.json().catch(() => null)) as PushTestBody | null;
  const installationId = body?.installationId?.trim();
  if (!installationId || !/^[A-Za-z0-9_-]{16,256}$/.test(installationId)) {
    return Response.json(
      { message: "A valid Firebase installation ID is required." },
      { status: 400 },
    );
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const accessToken = await authState.getToken();
  if (!supabaseUrl || !supabaseKey || !accessToken) {
    return Response.json(
      { message: "The company data session is unavailable." },
      { status: 503 },
    );
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    accessToken: async () => accessToken,
  });
  const { data: installation, error } = await supabase
    .from("push_installations")
    .select("installation_id")
    .eq("organization_id", orgId)
    .eq("user_id", userId)
    .eq("installation_id", installationId)
    .maybeSingle();

  if (error) {
    return Response.json(
      { message: "HeatMan could not verify this browser registration." },
      { status: 503 },
    );
  }
  if (!installation) {
    return Response.json(
      { message: "Enable push alerts on this browser before sending a test." },
      { status: 403 },
    );
  }

  try {
    const messaging = await getHeatManFirebaseMessaging();
    const messageId = await messaging.send({
      fid: installationId,
      data: {
        title: "HeatMan push is live",
        body: "Real browser heat-safety notifications are connected for your company workspace.",
        tag: "heatman-push-test",
        url: "/?push=test",
      },
      webpush: {
        headers: { Urgency: "high" },
      },
    });

    return Response.json({ delivered: true, messageId });
  } catch {
    return Response.json(
      { message: "Firebase rejected the test notification. Check the Admin credentials and Cloud Messaging API." },
      { status: 502 },
    );
  }
}
