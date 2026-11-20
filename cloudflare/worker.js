// Stack The Rat — archivio dei link brevi (Cloudflare Worker + KV, piano gratuito)
//
// POST /            corpo: il codice lungo del setup (quello dopo "#s=")
//                   risposta: { "id": "Ab12Cd34" }
// GET  /<id>        reindirizza all'app con il setup completo: APP_URL#s=<codice>
//
// Configurazione (vedi cloudflare/README.md):
//   - binding KV chiamato SETUPS
//   - variabile APP_URL = https://jaio-onlyvibecoding.github.io/stack-the-rat/

const MAX_LENGTH = 50_000; // un setup con molto storico resta ben sotto questo limite
const CODE_RE = /^[A-Za-z0-9_-]+$/; // solo caratteri base64url: niente testo arbitrario
const ID_RE = /^[A-Za-z0-9]{8}$/;
const BASE62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

/** Id corto ricavato dal contenuto: lo stesso setup produce sempre lo stesso link (niente doppioni). */
async function idFor(code) {
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(code)));
  let id = '';
  for (let i = 0; i < 8; i++) id += BASE62[hash[i] % 62];
  return id;
}

function cors(env) {
  const origin = new URL(env.APP_URL).origin;
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const headers = cors(env);

    if (request.method === 'OPTIONS') return new Response(null, { headers });

    // Salva un setup e restituisce l'id corto
    if (request.method === 'POST' && url.pathname === '/') {
      const code = (await request.text()).trim();
      if (!code || code.length > MAX_LENGTH || !CODE_RE.test(code)) {
        return new Response('Invalid setup', { status: 400, headers });
      }
      const id = await idFor(code);
      if (!(await env.SETUPS.get(id))) await env.SETUPS.put(id, code);
      return Response.json({ id }, { headers });
    }

    // Apre un link corto: reindirizza all'app con il setup completo
    const id = url.pathname.slice(1);
    if (request.method === 'GET' && ID_RE.test(id)) {
      const code = await env.SETUPS.get(id);
      if (code) return Response.redirect(`${env.APP_URL}#s=${code}`, 302);
      return Response.redirect(`${env.APP_URL}#missing`, 302);
    }

    // Qualsiasi altro indirizzo: all'app
    return Response.redirect(env.APP_URL, 302);
  },
};
