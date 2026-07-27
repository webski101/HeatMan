const FORTYGUARD_URL = "https://api.fortyguard.com/v1/status";

export async function GET(
  _request: Request,
  context: { params: Promise<{ activityId: string }> },
) {
  const apiKey = process.env.FORTYGUARD_API_KEY?.trim();
  if (!apiKey) {
    return Response.json(
      {
        configured: false,
        source: "demo",
        message: "FortyGuard is not configured.",
      },
      { status: 200 },
    );
  }

  const { activityId } = await context.params;
  if (!/^[a-zA-Z0-9-]{6,128}$/.test(activityId)) {
    return Response.json(
      { error: true, message: "The activity ID is invalid." },
      { status: 400 },
    );
  }

  const response = await fetch(
    `${FORTYGUARD_URL}/${encodeURIComponent(activityId)}`,
    {
      headers: {
        "api-key": apiKey,
        accept: "application/json",
      },
      cache: "no-store",
    },
  );
  const text = await response.text();

  return new Response(text, {
    status: response.status,
    headers: {
      "content-type":
        response.headers.get("content-type") ?? "application/json",
      "cache-control": "no-store",
    },
  });
}
