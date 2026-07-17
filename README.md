# EnonE Thai Thesaurus

Thai thesaurus SDK and REST API for text editors. It does not use AI and does
nothing while the user types. When the user selects a supported word, it shows
replacement words tagged with part of speech and language register.

Suggestions are sorted from lower to higher register:

`หยาบ → ภาษาพูด → ทั่วไป → กึ่งทางการ → ทางการ → วรรณกรรม → พระสงฆ์ → ราชาศัพท์`

## Live API

The public demo API runs on Render Free:

```text
https://enone-thai-thesaurus.onrender.com/api/v1/suggestions?word=กิน
```

Free instances can take around a minute to wake after a period without traffic.

Usage and contribution guide:

```text
https://enone-thai-thesaurus.onrender.com/docs
```

Contributors should submit one structured GitHub Issue per base word instead of
committing a full data file. This prevents stale local copies from overwriting
newer reviewed data. See [CONTRIBUTING.md](CONTRIBUTING.md).

## Quick start

```powershell
npm install
npm test
npm run dev
```

Copy `.env.example` to `.env`. The public read-only API defaults to
`CORS_ORIGINS=*`, so browser clients on any website can use it. To restrict a
private deployment, replace `*` with a comma-separated origin allowlist.
Requests without a browser Origin header remain available for server-to-server use. The API defaults to
120 requests per minute per client and can be adjusted with
`RATE_LIMIT_MAX` and `RATE_LIMIT_WINDOW`.

Query the API:

```text
GET http://127.0.0.1:8787/api/v1/suggestions?word=กิน
```

Example response:

```json
{
  "word": "กิน",
  "suggestions": [
    { "word": "แดก", "pos": ["ก."], "register": "หยาบ", "registerRank": 1 },
    { "word": "ซัด", "pos": ["ก."], "register": "ภาษาพูด", "registerRank": 2 }
  ]
}
```

## Browser integration

Import `attachThaiThesaurus` from the `enone-thai-thesaurus/browser` export,
include `enone-thai-thesaurus/browser/style.css`, then attach it to a
contenteditable element.
The UI uses monochrome tags only.

```ts
const detach = attachThaiThesaurus(editor, {
  endpoint: "https://example.com/api/v1/suggestions"
});
```

The generic adapter is intentionally small. TipTap/ProseMirror integration
should replace text through the editor transaction API so undo history remains
fully native.

## Importing Thai WordNet

Download a licensed Thai Open Multilingual Wordnet release in its tab-separated
format, preserve the accompanying license, then run:

```powershell
npm run import:wordnet -- path\to\wn-data-tha.tab data\generated\thesaurus.json
```

The importer creates synonym candidates from words sharing a synset and maps
WordNet POS codes to Thai abbreviations. Every imported register defaults to
`ทั่วไป`; register labels require human editorial review before production use.

## Data policy

- Thai WordNet supplies initial synonym relations and POS candidates.
- Register tags are maintained as editorial data.
- Royal Institute Dictionary data is not bundled or scraped.
- Each entry records a source ID; every distributed source must be declared in
  `data/source-manifest.json` with its exact license and version.

The dataset combines Thai WordNet candidates with manually maintained
editorial entries and register overrides. Automated checks protect ordering,
part-of-speech constraints, duplicate keys, and curated sense boundaries.
Language is contextual, so applications should present suggestions as choices
for the writer rather than automatic corrections.

## Production deployment

```powershell
npm ci
npm run build
npm start
```

Set `HOST=0.0.0.0` in the hosting environment and place HTTPS in front of the
service. Public read-only deployments can use `CORS_ORIGINS=*`; deployments
with private or state-changing endpoints should use an explicit allowlist. The
`/health` endpoint is intended for deployment health checks.

## License

Application code and EnonE editorial data are released under the MIT License.
Thai WordNet-derived data retains its upstream notice and license; see
`THIRD_PARTY_NOTICES.md` and `licenses/THAI_WORDNET_LICENSE`.
