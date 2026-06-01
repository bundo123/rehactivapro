// Función serverless (Vercel) — proxy seguro a Anthropic.
// La API key vive SOLO en process.env.ANTHROPIC_API_KEY: nunca se loguea ni se devuelve al cliente.
// Sin console.log a propósito: los datos clínicos del prompt no deben quedar en los logs de Vercel.
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
  } catch (e) {
    // Sin loguear 'e': el token es sensible.
    return res.status(401).json({ error: 'No autorizado' });
  }

  const { prompt } = req.body || {};
  if (!prompt || typeof prompt !== 'string') {
    return res.status(400).json({ error: 'Falta el prompt' });
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
        model: 'claude-haiku-4-5-20251001',
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
