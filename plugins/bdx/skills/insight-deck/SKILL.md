---
name: insight-deck
description: >-
  Read-only Abfrage der BDX-"Insight Deck"-Social-Performance-Daten (Firestore)
  über die HTTPS-Function insightQuery. Nutzen bei Fragen zu Insight Deck,
  Social-Zahlen, Reichweite/Follower/Views, Watch Time, Paid vs. organisch
  (Earned vs. Paid), Werbe-Spend oder der Performance einzelner BDX-Kunden
  bzw. beobachteter Interessenten. Der Skill LIEST nur, schreibt nie — weder an
  Insight-Deck-Daten noch an sonstige Spielfeld-Daten.
---

# Insight Deck — Daten-Abfrage (read-only)

Dieser Skill fragt die Social-Performance-Datenbasis des BDX "Insight Deck" ab:
Plattform-Zahlen (Instagram/Facebook/YouTube/TikTok) verbunden mit Werbe-Spend.
Er greift **ausschließlich lesend** auf acht freigegebene Firestore-Collections zu
(über die Function `insightQuery`). Er schreibt **nichts** — nicht an die
Insight-Deck-Daten und an keine andere Spielfeld-Collection.

## Setup (einmalig)

Nötig ist **eine** Umgebungsvariable, dein persönlicher Key:

- `INSIGHT_KEY` — persönlicher Daten-API-Key (das **einzige**, was du setzen musst).
  Holen über das Spielfeld: Modul **Insight Deck → Tab „So funktioniert's" →
  „Daten-API-Key generieren"**. Der Key wird nur **einmal** angezeigt; sofort hier eintragen.
- `INSIGHT_QUERY_URL` — optional. Die Function-URL ist fest im Skript hinterlegt;
  nur setzen, wenn sich die URL mal ändert.

```bash
export INSIGHT_KEY="idk_…"
```

## Nutzung

Das Skript `query.mjs` (Node, keine Dependencies) liegt **in diesem Skill-Verzeichnis**
(bei Plugin-Installation unter `$CLAUDE_PLUGIN_ROOT/skills/insight-deck/query.mjs`).
Es ruft die Function auf und gibt JSON auf stdout. Führe es mit seinem vollständigen
Pfad aus:

```bash
node "$CLAUDE_PLUGIN_ROOT/skills/insight-deck/query.mjs" --kind socialAccounts
node "$CLAUDE_PLUGIN_ROOT/skills/insight-deck/query.mjs" --kind socialAccounts --customer "<Kundenname>" --platform instagram
node "$CLAUDE_PLUGIN_ROOT/skills/insight-deck/query.mjs" --kind adDaily --from 2026-09-01 --to 2026-09-30 --limit 2000
```

Ist `$CLAUDE_PLUGIN_ROOT` nicht gesetzt, nutze den absoluten Pfad des `query.mjs`,
das neben dieser SKILL.md liegt.

CLI-Argumente:

| Arg | Wirkung |
|---|---|
| `--kind` | **Pflicht.** Eine der acht Collections (siehe unten). |
| `--customer` | Filter auf `customer` — nur `socialAccounts`, `adAccounts`. |
| `--platform` | Filter auf `platform` — nur `socialAccounts`, `socialAssets`. |
| `--from` / `--to` | `date`-Range (YYYY-MM-DD) — nur die *Daily-Collections. |
| `--limit` | Default 500, harte Obergrenze 5000. |

Antwort: `{ kind, count, limit, docs: [...] }`. Ein nicht unterstützter Filter
oder ein unbekanntes `kind` liefert HTTP 400 mit Klartext; ein fehlender/
ungültiger Key HTTP 401.

## Datenmodell — die acht lesbaren Collections

IDs: `accountId = {platform}_{externalId}`, `assetId = {platform}_{externalId}`,
Tages-Docs `{id}_{YYYY-MM-DD}`. Nicht gemessene Werte sind `null`, **nicht `0`**.

| kind | Kernfelder |
|---|---|
| `socialAccounts` | `customer`, `platform`, `handle`, `externalId`, `isProspect`, `active`, `adAccountIds` |
| `socialAccountDaily` | `accountId`, `date`, `followers`, `followerGain`, `reach`, `views`, `profileViews`, `websiteClicks`, `accountsEngaged`, `interactions` |
| `socialAssets` | `accountId`, `platform`, `type`, `publishedAt`, `caption`, `permalink`, `durationSec`, `tags`, `adSpendTotal`, `boostAdIds` |
| `socialAssetDaily` | `assetId`, `accountId`, `date`, `reach`, `views`, `likes`, `comments`, `saved`, `shares`, `interactions`, `avgWatchTimeMs`, `totalWatchTimeMs` |
| `adAccounts` | `customer`, `name`, `currency`, `externalId` |
| `adAccountDaily` | `adAccountId`, `date`, `spend`, `impressions`, `reach`, `frequency`, `clicks`, `ctr`, `cpc`, `cpm` |
| `ads` | `adAccountId`, `name`, `status`, `assetId`, `linkedVia`, `abVariant`, `lifetime` (map: `spend/impressions/reach/clicks/ctr/cpm`) |
| `adDaily` | `adId`, `adAccountId`, `date`, `spend`, `impressions`, `reach`, `clicks`, `ctr`, `cpm`, `videoP25…videoP100` |

## VERPFLICHTEND: Mess-Fallstricke (sonst rechnet man falsch)

Diese Regeln sind nicht optional — ohne sie entstehen falsche Zahlen:

1. **Post-Metriken sind LIFETIME-kumulativ.** `socialAssetDaily` ist ein
   **Snapshot des Standes seit Veröffentlichung**, kein Tageswert. Den
   „gestrigen Zuwachs" bekommt man nur als **Delta zweier Snapshots** (Tag D
   minus Tag D-1). Tageswerte NIE addieren — sonst zählt man denselben View
   30-mal.

2. **`reach` ist dedupliziert und über Tage NICHT addierbar.** Meta zählt eine
   mehrfach erreichte Person einmal. Die Summe der Tagesreichweiten ist
   bedeutungslos. Auch Anzeigen untereinander dedupliziert Meta nicht — man kann
   höchstens **Σ reach je Anzeige** zeigen und muss das so benennen.

3. **Earned vs. Paid sind DISJUNKT — nie subtrahieren.** Die organischen
   Media-Insights eines geboosteten Posts (`socialAssetDaily.reach/views`)
   enthalten die gekaufte Auslieferung **nicht**; die läuft über die
   Anzeigen-Kopie und steht in `ads`/`adDaily`. Earned = organisch,
   Paid = Lifetime je Anzeige aus **`ads.lifetime`** (nicht Fenstersummen aus
   `adDaily`). Nur das Verhältnis vergleichen, nie die Differenz bilden.

4. **`date` bedeutet je Collection einen anderen Tag:**
   - `socialAccountDaily` (IG/FB): Metas Insight-Tag = **Pazifik-Kalendertag**.
   - `socialAccountDaily` (YouTube/Interessenten) und `socialAssetDaily`:
     **Erfassungstag (Europe/Berlin)**.
   - `adAccountDaily`/`adDaily`: **Kalendertag des Werbekontos (Europe/Berlin)**.
   Für Tagesvergleiche taugt das; für Stundenlogik nicht.

5. **`null` ≠ `0`.** `null` heißt „nicht messbar/nicht erfasst" (z.B. Watch Time
   bei statischen Posts, Insights bei Dark Posts). Nicht als 0 behandeln,
   nicht in Mittelwerte einrechnen.

6. **Vergleichsmaßstab:** Median der letzten ~20 Posts desselben Kunden, nie
   Branchenbenchmarks oder Mittelwerte (ein viraler Post zerstört den Mittelwert).

## Read-Only

Der Skill **liest nur**. Es gibt keinen Schreibpfad: `insightQuery` schreibt
selbst nichts (auch kein `lastUsedAt`), und der Key berechtigt zu nichts außer
dem Lesen dieser acht Collections.
