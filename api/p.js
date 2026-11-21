// WEDFRAME · Página para compartir un perfil (vista previa en WhatsApp, etc.)
// WhatsApp y otras apps no ejecutan JavaScript: leen las etiquetas Open Graph
// del HTML. Esta función genera esas etiquetas con los datos públicos del
// perfil y redirige a las personas a la ficha normal (/?perfil=ID).
const SB_URL = 'https://mxchyqouddrimkxnebge.supabase.co';
const SB_KEY = 'sb_publishable_wvNDfN7CqFu-mO1gyQ56Ag_QH-wIEwb'; // clave pública (la misma que usa la web)
const DEFAULT_IMG = 'https://images.unsplash.com/photo-1511285560929-80b456fea0bc?w=1200&h=630&fit=crop&q=80';
const PROF = { videographer: 'Videógrafo', photographer: 'Fotógrafo', editor: 'Editor de vídeo' };

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const cut = (s, n) => { s = String(s ?? '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };

async function sbGet(path) {
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } });
  if (!r.ok) return [];
  return r.json();
}

export default async function handler(req, res) {
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'wedframe-app.vercel.app';
  const origin = `https://${host}`;
  const id = String(req.query.id || '');
  const valid = /^[0-9a-f-]{36}$/i.test(id);
  const target = valid ? `${origin}/?perfil=${id}` : `${origin}/`;

  let title = 'WEDFRAME · Fotógrafos, videógrafos y editores de boda';
  let desc = 'Descubre profesionales de boda, mira sus trabajos y pide presupuesto.';
  let image = DEFAULT_IMG;

  if (valid) {
    const [p] = await sbGet(`professional_profiles?user_id=eq.${id}&is_published=eq.true&select=display_name,profession,city,country,bio,style,avatar_path`);
    if (p) {
      const place = [p.city, p.country].filter(Boolean).join(', ');
      title = `${p.display_name} · ${PROF[p.profession] || 'Profesional'} de bodas${place ? ' en ' + place : ''}`;
      desc = cut(p.bio || p.style || 'Mira sus trabajos y pide presupuesto en WEDFRAME.', 180);
      const works = await sbGet(`portfolio_videos?professional_id=eq.${id}&select=video_url,description&order=created_at.desc&limit=50`);
      const isPhoto = (w) => (w.description || '').includes('[WF_PHOTO]') || /\.(jpe?g|png|webp|avif)(\?|#|$)/i.test(w.video_url || '');
      const cover = works.find((w) => isPhoto(w) && (w.description || '').includes('[WF_COVER]')) || works.find(isPhoto);
      if (cover?.video_url?.startsWith('https://')) image = cover.video_url;
      else if (p.avatar_path) image = `${SB_URL}/storage/v1/object/public/wedframe-avatars/${encodeURI(p.avatar_path)}`;
    }
  }

  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta property="og:type" content="profile">
<meta property="og:site_name" content="WEDFRAME">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:image" content="${esc(image)}">
<meta property="og:url" content="${esc(`${origin}/p/${valid ? id : ''}`)}">
<meta property="og:locale" content="es_ES">
<meta name="twitter:card" content="summary_large_image">
<meta name="robots" content="noindex">
<meta http-equiv="refresh" content="0;url=${esc(target)}">
<link rel="canonical" href="${esc(target)}">
</head><body style="font-family:system-ui;padding:30px">
<p>Abriendo WEDFRAME… <a href="${esc(target)}">Pulsa aquí si no se abre</a>.</p>
<script>location.replace(${JSON.stringify(target)})</script>
</body></html>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=600, stale-while-revalidate=3600');
  res.status(200).send(html);
}
