const FORTYGUARD_URL = "https://api.fortyguard.com/v1/heatmap";

export async function POST(request: Request) {
  const apiKey = process.env.FORTYGUARD_API_KEY?.trim();
  if (!apiKey) {
    return Response.json(
      {
        configured: false,
        source: "demo",
        message:
          "FortyGuard is not configured. HeatMan is using a labeled New York simulation.",
      },
      { status: 200 },
    );
  }

  try {
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
  } catch {
    return Response.json(
      {
        error: true,
        message: "FortyGuard could not be reached from this runtime. Try again shortly.",
      },
      { status: 502, headers: { "cache-control": "no-store" } },
    );
  }
}
