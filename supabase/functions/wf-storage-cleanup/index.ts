// WEDFRAME · Limpieza de archivos huérfanos
// Borra fotos y vídeos de los buckets de portfolio que ya no están
// enlazados a ningún trabajo (tabla portfolio_videos), y fotos de perfil que
// ya no usa ningún perfil, siempre que tengan más de 24 h.
// No recibe parámetros: aunque alguien la llame, solo puede borrar
// archivos que ya no usa nadie.
import { createClient } from "jsr:@supabase/supabase-js@2";

const URL_BASE = Deno.env.get("SUPABASE_URL")!;
const sb = createClient(URL_BASE, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const BUCKETS = ["wedframe-videos", "wedframe-gallery", "wedframe-avatars"];
const MIN_AGE_MS = 24 * 60 * 60 * 1000;

Deno.serve(async () => {
  const { data: rows, error } = await sb.from("portfolio_videos").select("video_url");
  if (error) return new Response(JSON.stringify({ error: "db" }), { status: 500 });
  const used = new Set<string>();
  for (const r of rows ?? []) {
    const m = String(r.video_url ?? "").match(/\/storage\/v1\/object\/public\/([^/]+)\/(.+?)(?:[?#].*)?$/);
    if (m) used.add(`${m[1]}/${decodeURIComponent(m[2])}`);
  }
  const { data: profs, error: pErr } = await sb.from("professional_profiles").select("avatar_path");
  if (pErr) return new Response(JSON.stringify({ error: "db" }), { status: 500 });
  for (const p of profs ?? []) if (p.avatar_path) used.add(`wedframe-avatars/${p.avatar_path}`);
  for (let page = 1; page < 50; page++) {
    const { data: lu, error: uErr } = await sb.auth.admin.listUsers({ page, perPage: 1000 });
    if (uErr) return new Response(JSON.stringify({ error: "auth" }), { status: 500 });
    for (const u of lu.users) { const a = u.user_metadata?.avatar_path; if (a) used.add(`wedframe-avatars/${a}`); }
    if (lu.users.length < 1000) break;
  }
  const isUsed = (bucket: string, name: string) =>
    used.has(`${bucket}/${name}`) || used.has(`${bucket}/${name.replace(/\.part\d+$/, ".part0")}`);

  const report: Record<string, { removed: number; mb: number }> = {};
  for (const bucket of BUCKETS) {
    report[bucket] = { removed: 0, mb: 0 };
    const { data: folders } = await sb.storage.from(bucket).list("", { limit: 1000 });
    for (const f of folders ?? []) {
      if (f.id) continue; // solo carpetas (una por usuario)
      const { data: files } = await sb.storage.from(bucket).list(f.name, { limit: 1000 });
      const orphan = (files ?? []).filter((o) => {
        const name = `${f.name}/${o.name}`;
        const age = Date.now() - Date.parse(o.created_at ?? "");
        return o.id && age > MIN_AGE_MS && !isUsed(bucket, name);
      });
      if (!orphan.length) continue;
      const paths = orphan.map((o) => `${f.name}/${o.name}`);
      const { error: rmErr } = await sb.storage.from(bucket).remove(paths);
      if (!rmErr) {
        report[bucket].removed += paths.length;
        report[bucket].mb += orphan.reduce((s, o) => s + Number(o.metadata?.size ?? 0), 0) / 1048576;
      }
    }
    report[bucket].mb = Math.round(report[bucket].mb * 10) / 10;
  }
  return new Response(JSON.stringify(report), { headers: { "Content-Type": "application/json" } });
});
