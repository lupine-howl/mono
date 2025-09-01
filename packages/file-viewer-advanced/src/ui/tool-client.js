// example/public/tool-client.js
export function createToolClient(base = location.origin, prefix = "/rpc") {
  async function call(name, args = {}, { method = "POST", signal } = {}) {
    const url = new URL(`${prefix}/${name}`, base);
    const init = { method, headers: { Accept: "application/json" }, signal };

    if (method === "GET") {
      for (const [k, v] of Object.entries(args || {})) {
        url.searchParams.set(
          k,
          typeof v === "object" ? JSON.stringify(v) : String(v)
        );
      }
    } else {
      init.headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(args || {});
    }

    const res = await fetch(url, init);
    const text = await res.text();
    if (!res.ok) throw new Error(text || res.statusText);
    return text ? JSON.parse(text) : null;
  }

  // Proxy so you can do: api.get_horoscope({ sign: "Aries" })
  return new Proxy(
    {},
    {
      get: (_t, name) => (args, opts) => call(name, args, opts || {}),
    }
  );
}
