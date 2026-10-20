#!/usr/bin/env node
// Read-only Abfrage der Insight-Deck-Daten über die HTTPS-Function `insightQuery`.
// Keine Dependencies — nur Node (global fetch, ab Node 18).
//
// Env:
//   INSIGHT_KEY        persönlicher Daten-API-Key (Spielfeld → Insight Deck → „So funktioniert's")
//   INSIGHT_QUERY_URL  deployte URL der Function insightQuery
//
// Beispiel:
//   node query.mjs --kind adDaily --from 2026-09-01 --to 2026-09-30 --limit 2000

const FLAGS = ['kind', 'customer', 'platform', 'from', 'to', 'limit']

function parseArgs(argv) {
  const out = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (!a.startsWith('--')) continue
    const name = a.slice(2)
    if (!FLAGS.includes(name)) {
      fail(`Unbekanntes Argument: --${name}. Erlaubt: ${FLAGS.map((f) => '--' + f).join(', ')}`)
    }
    const val = argv[i + 1]
    if (val === undefined || val.startsWith('--')) fail(`--${name} braucht einen Wert.`)
    out[name] = val
    i++
  }
  return out
}

function fail(msg) {
  process.stderr.write(`Fehler: ${msg}\n`)
  process.exit(1)
}

async function main() {
  const key = process.env.INSIGHT_KEY
  // URL ist kein Secret (Schutz ist der Key) → fest verdrahtet, per Env überschreibbar.
  const base = process.env.INSIGHT_QUERY_URL || 'https://europe-west3-bdx-spielfeld.cloudfunctions.net/insightQuery'
  if (!key) fail('INSIGHT_KEY ist nicht gesetzt (Spielfeld → Insight Deck → „So funktioniert’s" → „Daten-API-Key generieren").')

  const args = parseArgs(process.argv.slice(2))
  if (!args.kind) fail('--kind ist Pflicht (z.B. socialAccounts, adDaily).')

  const url = new URL(base)
  for (const f of FLAGS) if (args[f] !== undefined) url.searchParams.set(f, args[f])

  let res
  try {
    res = await fetch(url, { headers: { 'x-insight-key': key } })
  } catch (e) {
    fail(`Netzwerkfehler: ${e instanceof Error ? e.message : String(e)}`)
  }

  const text = await res.text()
  let body
  try { body = JSON.parse(text) } catch { body = { _raw: text } }

  if (!res.ok) {
    const detail = body && body.error ? body.error : text.slice(0, 200)
    fail(`HTTP ${res.status}: ${detail}`)
  }

  process.stdout.write(JSON.stringify(body, null, 2) + '\n')
}

main()
