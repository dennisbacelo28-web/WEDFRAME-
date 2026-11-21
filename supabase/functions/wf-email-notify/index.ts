// WEDFRAME · Avisos por correo
// Lo llama un trigger de la base de datos cada vez que se crea una fila en
// user_notifications. No confía en lo que recibe: vuelve a leer la
// notificación con la clave de servicio, solo la procesa si es reciente y
// nadie la ha reclamado antes, y nunca incluye el contenido de los mensajes.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const SITE = Deno.env.get("WF_SITE_URL") ?? "https://wedframe-app.vercel.app";
const GMAIL_USER = Deno.env.get("GMAIL_USER") ?? "";
const GMAIL_PASS = Deno.env.get("GMAIL_APP_PASSWORD") ?? "";
const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});

const COPY: Record<string, { subject: string; line: string; path: string }> = {
  request: { subject: "Nueva solicitud de presupuesto", line: "Has recibido una nueva solicitud de presupuesto.", path: "requests" },
  message: { subject: "Tienes un mensaje nuevo", line: "Tienes un mensaje nuevo en una de tus conversaciones.", path: "messages" },
  agreement: { subject: "Novedades en un acuerdo", line: "Hay novedades en uno de tus acuerdos.", path: "contracts" },
  contract: { subject: "Nuevo contrato disponible", line: "El profesional ha añadido un contrato en PDF a vuestro acuerdo.", path: "contracts" },
  review: { subject: "Has recibido una valoración", line: "Una pareja ha publicado una valoración sobre tu trabajo.", path: "requests" },
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

async function finish(id: string, status: string) {
  await sb.from("user_notifications").update({ email_status: status }).eq("id", id);
  return json(200, { status });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { error: "method" });
  let id = "";
  try { id = String((await req.json())?.id ?? ""); } catch { return json(400, { error: "body" }); }
  if (!/^[0-9a-f-]{36}$/i.test(id)) return json(400, { error: "id" });

  // Reclamar la notificación de forma atómica (solo una vez y solo si es reciente).
  const since = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { data: n, error } = await sb.from("user_notifications")
    .update({ emailed_at: new Date().toISOString() })
    .eq("id", id).is("emailed_at", null).gte("created_at", since)
    .select("id,recipient_id,event_type,quote_request_id").maybeSingle();
  if (error) return json(500, { error: "db" });
  if (!n) return json(200, { status: "ignored" });

  const copy = COPY[n.event_type];
  if (!copy) return finish(n.id, "skipped_type");
  if (!GMAIL_USER || !GMAIL_PASS) return finish(n.id, "no_config");

  // Para mensajes: como mucho un correo cada 15 minutos por conversación.
  if (n.event_type === "message" && n.quote_request_id) {
    const win = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const { count } = await sb.from("user_notifications").select("id", { count: "exact", head: true })
      .eq("recipient_id", n.recipient_id).eq("quote_request_id", n.quote_request_id)
      .eq("event_type", "message").eq("email_status", "sent").gte("emailed_at", win).neq("id", n.id);
    if ((count ?? 0) > 0) return finish(n.id, "throttled");
  }

  const { data: u, error: ue } = await sb.auth.admin.getUserById(n.recipient_id);
  const email = u?.user?.email;
  if (ue || !email) return finish(n.id, "no_email");
  if (u.user.user_metadata?.email_notifications === false) return finish(n.id, "opted_out");

  const link = `${SITE}/?ir=${copy.path}`;
  const text = `Hola,\n\n${copy.line}\n\nEntra en WEDFRAME para verlo:\n${link}\n\n—\nWEDFRAME\nPuedes desactivar estos avisos en Mi cuenta → Ajustes.`;
  const html = `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;color:#2b2133">
<p style="font:bold 22px Georgia,serif;margin:0 0 18px">WED<span style="color:#ac54ba">FRAME</span></p>
<p>Hola,</p><p>${copy.line}</p>
<p style="margin:26px 0"><a href="${link}" style="background:#8751b8;color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:bold">Abrir WEDFRAME</a></p>
<p style="font-size:12px;color:#7a6c82">Por tu privacidad, no incluimos el contenido en este correo.<br>Puedes desactivar estos avisos en Mi cuenta → Ajustes.</p></div>`;

  const client = new SMTPClient({ connection: { hostname: "smtp.gmail.com", port: 465, tls: true, auth: { username: GMAIL_USER, password: GMAIL_PASS } } });
  try {
    await client.send({ from: `WEDFRAME <${GMAIL_USER}>`, to: email, subject: `WEDFRAME · ${copy.subject}`, content: text, html });
    await client.close();
    return finish(n.id, "sent");
  } catch (e) {
    try { await client.close(); } catch { /* ignore */ }
    console.error("smtp", (e as Error)?.message);
    return finish(n.id, "error");
  }
});
