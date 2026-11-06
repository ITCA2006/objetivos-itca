// Servidor de la web Objetivos 2027 ITCA.
// GET  /api/datos                 -> cualquiera puede leer los datos.
// POST /api/datos  accion=login     -> verifica usuario y contraseña.
// POST /api/datos  accion=guardar   -> guarda los datos (y una copia en el historial).
// POST /api/datos  accion=historial -> lista las versiones guardadas.
// POST /api/datos  accion=restaurar -> vuelve a una versión anterior.
// Todo lo que modifica o lista el historial necesita usuario y contraseña.
// Los usuarios se configuran en Netlify, variable de entorno ANALISTAS:
//   usuario1:clave1,usuario2:clave2,usuario3:clave3
import { getStore } from "@netlify/blobs";

const MAX_HISTORIAL = 300;

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

// Guarda el estado nuevo como actual y deja una copia en el historial.
async function guardarVersion(store, estado, por, nota) {
  const version = String(Date.now());
  await store.setJSON("historial/" + version, estado);
  const indice = (await store.get("historial-indice", { type: "json" })) || [];
  indice.unshift({ v: version, at: new Date().toISOString(), por, nota: String(nota || "").slice(0, 200) });
  const sobran = indice.splice(MAX_HISTORIAL);
  for (const x of sobran) await store.delete("historial/" + x.v);
  await store.setJSON("historial-indice", indice);
  await store.setJSON("estado", estado);
  await store.set("version", version);
  return version;
}

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
  const usuario = String(b.usuario).trim();

  if (b.accion === "login") return json({ ok: true, usuario });

  if (b.accion === "guardar") {
    if (!b.estado || typeof b.estado !== "object" || !b.estado.obj) return json({ error: "estado" }, 400);
    const actual = await store.get("version");
    if (actual && b.base !== actual) {
      const estado = await store.get("estado", { type: "json" });
      return json({ error: "conflicto", estado, version: actual }, 409);
    }
    const version = await guardarVersion(store, b.estado, usuario, b.nota);
    return json({ ok: true, version });
  }

  if (b.accion === "historial") {
    const indice = (await store.get("historial-indice", { type: "json" })) || [];
    return json({ historial: indice, actual: (await store.get("version")) || null });
  }

  if (b.accion === "restaurar") {
    const v = String(b.version || "");
    if (!/^\d+$/.test(v)) return json({ error: "version" }, 400);
    const viejo = await store.get("historial/" + v, { type: "json" });
    if (!viejo) return json({ error: "no existe" }, 404);
    const fecha = new Date(Number(v)).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" });
    const version = await guardarVersion(store, viejo, usuario, "Volvió a la versión del " + fecha);
    return json({ ok: true, version, estado: viejo });
  }

  return json({ error: "accion" }, 400);
};

export const config = { path: "/api/datos" };
