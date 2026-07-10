// Función serverless (Vercel) — proxy seguro a Anthropic.
// La API key vive SOLO en process.env.ANTHROPIC_API_KEY: nunca se loguea ni se devuelve al cliente.
// Sin console.log a propósito: los datos clínicos del prompt no deben quedar en los logs de Vercel.

// Rate-limit in-memory por usuario. Vive por instancia serverless (se resetea en cold start y no
// se comparte entre instancias), pero corta el spam sostenido desde una misma sesión sin infra extra.
const RATE_MAX = 10;              // llamadas
const RATE_WINDOW_MS = 60_000;    // por minuto
const rateLog = new Map();        // userId -> [timestamps]

function isRateLimited(userId) {
  const now = Date.now();
  const hits = (rateLog.get(userId) || []).filter(t => now - t < RATE_WINDOW_MS);
  if (hits.length >= RATE_MAX) { rateLog.set(userId, hits); return true; }
  hits.push(now);
  rateLog.set(userId, hits);
  // Poda: que el Map no crezca sin tope en instancias longevas.
  if (rateLog.size > 500) {
    for (const [k, v] of rateLog) {
      if (!v.length || now - v[v.length - 1] >= RATE_WINDOW_MS) rateLog.delete(k);
    }
  }
  return false;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  // ── Auth: solo usuarios autenticados de Supabase pueden gastar la key paga ──
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token) {
    return res.status(401).json({ error: 'No autorizado' });
  }
  let userId = '';
  try {
    const userRes = await fetch(`${process.env.VITE_SUPABASE_URL}/auth/v1/user`, {
      headers: {
        apikey: process.env.VITE_SUPABASE_ANON_KEY,
        Authorization: 'Bearer ' + token
      }
    });
    if (!userRes.ok) {
      return res.status(401).json({ error: 'No autorizado' });
    }
    const user = await userRes.json();
    userId = user?.id || '';
    if (!userId) {
      return res.status(401).json({ error: 'No autorizado' });
    }

    // ── Rol: espejo server-side de viewAI (permissions.js) — solo admin y terapeuta.
    // Se lee el perfil propio con el token del usuario (la RLS ya lo permite: auth.js hace lo mismo).
    const profRes = await fetch(
      `${process.env.VITE_SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}&select=role`, {
      headers: {
        apikey: process.env.VITE_SUPABASE_ANON_KEY,
        Authorization: 'Bearer ' + token
      }
    });
    if (!profRes.ok) {
      return res.status(401).json({ error: 'No autorizado' });
    }
    const rows = await profRes.json();
    const role = Array.isArray(rows) && rows[0] ? rows[0].role : '';
    if (role !== 'admin' && role !== 'terapeuta') {
      return res.status(403).json({ error: 'Tu rol no permite generar informes con IA' });
    }
  } catch (e) {
    // Sin loguear 'e': el token es sensible.
    return res.status(401).json({ error: 'No autorizado' });
  }

  if (isRateLimited(userId)) {
    return res.status(429).json({ error: 'Demasiadas solicitudes. Espera un minuto.' });
  }

  const { prompt } = req.body || {};
  if (!prompt || typeof prompt !== 'string') {
    return res.status(400).json({ error: 'Falta el prompt' });
  }
  // Tope de tamaño: el prompt clínico real ronda 3-6k chars (historial + contexto de protocolo
  // capado a 1.200). 20k es techo holgado; más que eso es abuso o bug y no debe gastar la key paga.
  if (prompt.length > 20000) {
    return res.status(413).json({ error: 'Prompt demasiado largo' });
  }
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }]
      })
    });
    if (!r.ok) {
      // No reenviamos el cuerpo de Anthropic al cliente (puede traer detalles internos).
      return res.status(500).json({ error: 'No se pudo generar el informe' });
    }
    const data = await r.json();
    const text = data?.content?.[0]?.text || '';
    return res.status(200).json({ text });
  } catch (e) {
    // Sin loguear 'e': podría arrastrar el prompt o detalles sensibles.
    return res.status(500).json({ error: 'No se pudo generar el informe' });
  }
}
