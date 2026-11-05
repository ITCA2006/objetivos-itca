// Servidor de la web Objetivos 2027 ITCA.
// GET  /api/datos            -> cualquiera puede leer los datos.
// POST /api/datos (login)    -> verifica usuario y contraseña.
// POST /api/datos (guardar)  -> guarda los datos, solo con usuario y contraseña válidos.
// Los usuarios se configuran en Netlify, variable de entorno ANALISTAS:
//   usuario1:clave1,usuario2:clave2,usuario3:clave3
import { getStore } from "@netlify/blobs";

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

function analistas() {
  return (process.env.ANALISTAS || "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean)
    .map((x) => {
      const i = x.lastIndexOf(":");
      return { u: x.slice(0, i).trim().toLowerCase(), p: x.slice(i + 1) };
    });
}
function valido(u, p) {
  const user = String(u || "").trim().toLowerCase();
  return analistas().some((a) => a.u === user && a.p === String(p || ""));
}
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

export default async (req) => {
  const store = getStore("objetivos");

  if (req.method === "GET") {
    const estado = await store.get("estado", { type: "json" });
    const version = await store.get("version");
    return json({ estado: estado || null, version: version || null });
  }
  if (req.method !== "POST") return json({ error: "metodo" }, 405);

  let b;
  try { b = await req.json(); } catch { return json({ error: "json" }, 400); }

  if (!valido(b.usuario, b.clave)) { await espera(800); return json({ error: "credenciales" }, 401); }

  if (b.accion === "login") return json({ ok: true, usuario: String(b.usuario).trim() });

  if (b.accion === "guardar") {
    if (!b.estado || typeof b.estado !== "object" || !b.estado.obj) return json({ error: "estado" }, 400);
    const actual = await store.get("version");
    if (actual && b.base !== actual) {
      const estado = await store.get("estado", { type: "json" });
      return json({ error: "conflicto", estado, version: actual }, 409);
    }
    const version = String(Date.now());
    await store.setJSON("estado", b.estado);
    await store.set("version", version);
    return json({ ok: true, version });
  }
  return json({ error: "accion" }, 400);
};

export const config = { path: "/api/datos" };
