
import { getStore } from "@netlify/blobs";

const PASS = "2026";      // كلمة مرور المعلمات
const OWNER = "1448";     // كلمة مرور المشرفة
const json = (d, s = 200) =>
  new Response(JSON.stringify(d), { status: s, headers: { "content-type": "application/json", "cache-control": "no-store" } });
const WEEK = /^s[12]w\d{1,2}$/;
const okKey = (k) =>
  /^(main|teachers|timetable|week\/s[12]w\d{1,2}|cell\/s[12]w\d{1,2}\/d[0-4]-p[1-8]|archive\/\d+)$/.test(k);

export default async (req) => {
  const pass = req.headers.get("x-pass");
  const role = pass === OWNER ? "owner" : pass === PASS ? "teacher" : null;
  if (!role) return json({ error: "pass" }, 401);
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

  // ترحيل بيانات النسخة السابقة (جدول أسبوع واحد) إلى النسخة الحالية
  const migrate = async () => {
    const old = await all("cell/d");
    const keys = Object.keys(old);
    if (!keys.length) return null;
    const tt = {};
    for (const k of keys) {
      const v = old[k] || {};
      const id = "d" + k;
      if (v.subject) tt[id] = v.subject;
      if (v.lesson || v.homework)
        await st.setJSON("cell/s1w6/" + id, { lesson: v.lesson || "", homework: v.homework || "", updatedAt: v.updatedAt || 0 });
    }
    await st.setJSON("timetable", tt);
    const main = await st.get("main", { type: "json" });
    if (main) {
      if (main.weeklyValue && !(await st.get("week/s1w6", { type: "json" })))
        await st.setJSON("week/s1w6", { value: main.weeklyValue });
      if (!main.activeWeek) await st.setJSON("main", { ...main, activeWeek: "s1w6" });
    }
    return tt;
  };

  if (req.method === "GET") {
    if (!(await st.get("timetable", { type: "json" }))) await migrate();
    const [main, teachers, timetable] = await Promise.all([
      st.get("main", { type: "json" }),
      st.get("teachers", { type: "json" }),
      st.get("timetable", { type: "json" }),
    ]);
    let weekId = url.searchParams.get("week");
    if (!weekId || !WEEK.test(weekId)) weekId = (main && main.activeWeek) || "s1w1";
    const [week, cells] = await Promise.all([
      st.get("week/" + weekId, { type: "json" }),
      all("cell/" + weekId + "/"),
    ]);
    let log = null;
    if (role === "owner" && url.searchParams.get("log")) {
      const l = await all("log/");
      log = Object.entries(l).map(([id, v]) => ({ id, ...v }))
        .sort((a, b) => b.at - a.at).slice(0, 300);
    }
    return json({ role, main, teachers, timetable, weekId, week, cells, log });
  }

  const body = await req.json();
  if (op === "set") {
    if (!okKey(body.key)) return json({ error: "key" }, 400);
    if (role !== "owner" && !body.key.startsWith("cell/")) return json({ error: "owner" }, 403);
    await st.setJSON(body.key, body.data);
    return json({ ok: true });
  }
  if (op === "log") {
    const id = Date.now() + "-" + Math.random().toString(36).slice(2, 7);
    await st.setJSON("log/" + id, body.data);
    return json({ ok: true, id });
  }
  if (op === "seen") {
    if (role !== "owner") return json({ error: "owner" }, 403);
    await Promise.all((body.ids || []).map(async (id) => {
      const v = await st.get("log/" + id, { type: "json" });
      if (v) await st.setJSON("log/" + id, { ...v, seen: true });
    }));
    return json({ ok: true });
  }
  return json({ error: "op" }, 400);
};

export const config = { path: "/api" };
المحتوى من إنشاء المستخدمين وغير موثق.
