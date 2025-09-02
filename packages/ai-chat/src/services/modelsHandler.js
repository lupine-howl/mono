export function mountModelsRoute(
  router,
  {
    path = "/api/models",
    apiKey = process.env.OPENAI_API_KEY,
    filter = null, // optional (id)=>boolean
    baseUrl = "https://api.openai.com/v1",
  } = {}
) {
  async function listModels() {
    const headers = {
      "content-type": "application/json",
      ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
    };
    const res = await fetch(`${baseUrl}/models`, { headers });
    const data = await res.json();
    return { ok: res.ok, status: res.status, data };
  }

  router.get(path, async () => {
    try {
      if (!apiKey) {
        return {
          status: 200,
          json: { models: [], note: "No API key configured" },
        };
      }
      const { ok, status, data } = await listModels();
      if (!ok) {
        return {
          status,
          json: { models: [], error: data?.error?.message || "OpenAI error" },
        };
      }
      let ids = Array.isArray(data?.data)
        ? data.data.map((m) => m.id).filter(Boolean)
        : [];
      if (typeof filter === "function") ids = ids.filter(filter);
      ids.sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
      return { status: 200, json: { models: ids } };
    } catch (err) {
      return { status: 500, json: { models: [], error: String(err) } };
    }
  });
}
