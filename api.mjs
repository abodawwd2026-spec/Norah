import { getStore } from "@netlify/blobs";

const PASS = "2026";
const json = (d, s = 200) =>
  new Response(JSON.stringify(d), { status: s, headers: { "content-type": "application/json" } });
const okKey = (k) => /^(main|teachers|cell\/d[0-4]-p[1-8]|archive\/\d+)$/.test(k);

export default async (req) => {
  if (req.headers.get("x-pass") !== PASS) return json({ error: "pass" }, 401);
  const st = getStore({ name: "plan", consistency: "strong" });
  const url = new URL(req.url);
  const op = url.searchParams.get("op");

  const all = async (prefix) => {
    const { blobs } = await st.list({ prefix });
    const out = {};
    await Promise.all(blobs.map(async (b) => {
      out[b.key.slice(prefix.length)] = await st.get(b.key, { type: "json" });
    }));
    return out;
  };

  if (req.method === "GET") {
    const [main, teachers, cells] = await Promise.all([
      st.get("main", { type: "json" }),
      st.get("teachers", { type: "json" }),
      all("cell/"),
    ]);
    let log = null;
    if (url.searchParams.get("log")) {
      const l = await all("log/");
      log = Object.entries(l).map(([id, v]) => ({ id, ...v }))
        .sort((a, b) => b.at - a.at).slice(0, 300);
    }
    return json({ main, teachers, cells, log });
  }

  const body = await req.json();
  if (op === "set") {
    if (!okKey(body.key)) return json({ error: "key" }, 400);
    await st.setJSON(body.key, body.data);
    return json({ ok: true });
  }
  if (op === "log") {
    const id = Date.now() + "-" + Math.random().toString(36).slice(2, 7);
    await st.setJSON("log/" + id, body.data);
    return json({ ok: true, id });
  }
  if (op === "seen") {
    await Promise.all((body.ids || []).map(async (id) => {
      const v = await st.get("log/" + id, { type: "json" });
      if (v) await st.setJSON("log/" + id, { ...v, seen: true });
    }));
    return json({ ok: true });
  }
  return json({ error: "op" }, 400);
};

export const config = { path: "/api" };
