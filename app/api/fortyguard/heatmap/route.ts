const FORTYGUARD_URL = "https://api.fortyguard.com/v1/heatmap";

export async function POST(request: Request) {
  const apiKey = process.env.FORTYGUARD_API_KEY?.trim();
  if (!apiKey) {
    return Response.json(
      {
        configured: false,
        source: "demo",
        message:
          "FortyGuard is not configured. HeatGuard is using a labeled Miami simulation.",
      },
      { status: 200 },
    );
  }

  const payload = await request.json();
  const response = await fetch(FORTYGUARD_URL, {
    method: "POST",
    headers: {
      "api-key": apiKey,
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify(payload),
  });
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

