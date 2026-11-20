# Link brevi con Cloudflare (gratis)

Il Worker in `worker.js` salva i setup condivisi e crea link come
`https://stack-the-rat.<tuo-sottodominio>.workers.dev/Ab12Cd34`.
Aprendo il link si viene reindirizzati all'app con il setup completo.

## Configurazione (una volta sola, dal sito di Cloudflare)

1. **Account** — registrati gratis su https://dash.cloudflare.com/sign-up
2. **Archivio (KV)** — menu *Storage & Databases → Workers KV → Create instance*.
   Nome: `stack-the-rat-setups`.
3. **Worker** — menu *Compute (Workers) → Workers & Pages → Create → Start with Hello World*.
   Nome: `stack-the-rat` → *Deploy*.
4. **Codice** — nel Worker appena creato: *Edit code*, cancella tutto, incolla il contenuto di
   `worker.js`, poi *Deploy*.
5. **Collegamenti** — nel Worker: *Settings → Bindings → Add binding → KV namespace*:
   - Variable name: `SETUPS`
   - KV namespace: `stack-the-rat-setups`
6. **Variabile** — sempre in *Settings → Variables and Secrets → Add*:
   - Type: Text, Name: `APP_URL`, Value: `https://jaio-onlyvibecoding.github.io/stack-the-rat/`
   - poi *Deploy*.
7. **Indirizzo** — copia l'indirizzo del Worker (es. `https://stack-the-rat.mario.workers.dev`)
   e comunicalo: va inserito nell'app (`SHORT_LINK_URL` in `src/share.ts`).

Indirizzo attuale: https://stack-the-rat.jacopotavianucci.workers.dev

## Limiti del piano gratuito
- 100.000 richieste al giorno, 1.000 nuovi link al giorno, 1 GB di spazio (circa un milione di setup).
- I setup non scadono. Lo stesso setup produce sempre lo stesso link (nessun doppione).
- Accetta solo codici di setup (caratteri base64url, max 50.000 caratteri).
- Chiunque abbia un link può aprire quel setup: contiene solo codici delle carte, giocatori A–D e i
  messaggi dello storico, nessun dato personale.
