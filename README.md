# άραξε — Thessaloniki parking

Responsive Greek PWA for the metropolitan Thessaloniki area. Node.js 22.13+, no npm dependencies or paid API keys.

## Run

```
npm install
npm test
npm start
```

Open http://localhost:3000. Render configuration is in `render.yaml`; select a free Node web service, build `npm install --omit=dev`, start `npm start`, health check `/api/health`.

## What works

- 42 named areas from Sindos/Oreokastro to Thermi/Perea; this is metropolitan coverage, not an exhaustive street inventory.
- OpenStreetMap parking inventory across bbox 40.48,22.78,40.76,23.15 from Overpass. Cached six hours, stale data labeled; no invented fallback inventory. If providers fail, areas still work and the inventory says unavailable. OSM data ODbL, © OpenStreetMap contributors.
- Filters for access, recorded fee and disabled spaces; unknown values remain unknown. Private/customer/permit-only facilities excluded from public results. No assumption that mapped parking is free or has empty spaces.
- Browser GPS, Google Maps navigation, device-local saved car, installable PWA shell, optional Esri imagery background (not live, unknown capture date).
- Actual incremental Bayesian learning from completed user-reported street-parking searches. Every successful/failed search updates the posterior without retraining a neural network or any LLM.

## Model and evaluation

Target: reported success finding a legal on-street space within ten minutes, by area, Athens local hour ±2 and weekday/weekend. Not exact-space occupancy or a calibrated population probability. Start Beta(1,1), update with outcomes; evidence half-life 45 days, retain 180 days. Hour weight 1/.65/.3 for 0/1/2h. Probabilities remain hidden below effective sample size 12. Until then a separate explicit time/type heuristic is shown. Confidence interval is a bounded normal approximation, descriptive only.

Prequential Brier score uses earlier observations only (not current/future labels); compare against constant .5 baseline (.25 Brier). Evidence is voluntary and self-reported: sampling bias, unreliable users, area approximation and changing conditions limit accuracy. No "trained" claims with no data, no satellite inference, no invented accuracy, no verified-space claims.

## Persistence — important

The app uses SQLite at `DATA_DIR/learning.sqlite` or `./data/learning.sqlite`. On a free Render service the local filesystem is ephemeral. **Shared training is not durable through a deploy/restart on this plan.** The UI states this clearly. Each driver's own successful submissions remain in their browser localStorage, with JSON export/import; clearing browser storage removes that copy. Shared events are deduplicated with personal events.

For continuous collective learning across deployments, provision durable storage separately: attach a persistent disk on a suitable Render plan and set `DATA_DIR=/var/data/araxe`, or migrate observations to an external durable database. Do not set DATA_DIR to an ephemeral directory and mistake it for a disk. Use one process with this SQLite design. Back up the database. No paid service is automatically provisioned by this repository.

The service refreshes inventory at boot and every six hours while running; browser model updates every 60 seconds. Free Render services can sleep; there is no unattended training without observations. Reporting is a deliberate action; GPS and saved car are not sent to the application backend. Public model endpoint exposes only coarse area, outcome, timestamp, and event UUID. A hashed random browser ID is stored privately in SQLite for throttling. Reverse-proxy deployment relies primarily on browser-ID cooldown, not trusted client IP. This is abuse friction, not proof-of-personhood. Import affects local predictions only, never uploads arbitrary historical reports to the shared model.

## Sources

- https://wiki.openstreetmap.org/wiki/Overpass_API
- https://thesi.gr/ (official payment information; no live occupancy integration)
- https://opendata.thessaloniki.gr/ (research lead only; historical municipal inventories are not imported into this version)
- https://dataspace.copernicus.eu/data-collections/copernicus-sentinel-missions/sentinel-2 (10m optical imagery cannot resolve individual parking bays)
- https://render.com/docs/free

See `model.test.mjs` for cold-start, learning, decay, deduplication, timezone and evaluation tests. All API observations are validated and stamped with server time. No accounts, cameras or exact street-space detection are implemented.

## Road overlays and traffic learning

Selecting an area loads actual OSM road geometries (roughly 2km across) through `/api/streets?zone=<id>`, cached for 24h. Roads are gray until the selected area's model has effective sample size >=12. Parking road colors: green >=60% reported success, amber 35–59%, red <35%. **Every street in an overlay carries the area prediction, not a street-level calibrated prediction.** No fictitious road coordinates or live occupancy are generated.

The traffic layer uses a separate contextual Dirichlet(1,1,1) model over normal/slow/congested user reports, 14-day evidence half-life, 90-day horizon, same weekend/hour neighborhood. Color is based on expected normalized severity: green <=.35, amber <=.65, red >.65. This is a time-of-day pattern learned from reports, not a real-time speed feed. No traffic accuracy metric is claimed. Traffic observations have separate SQLite storage and device-local export/import.

## Private daily parking tools

Favorites, workplace address, chosen work/center areas, own plate, front/back vehicle plates, floor/bay, notes, optional expiry and user-entered hourly rate stay in localStorage. Front/back photos stay only in browser IndexedDB (up to 12MB each); no upload endpoint exists. Ending a parking session deletes surrounding plates, notes, saved location and photos; own plate and favorites are retained. The timer works in the foreground, not as background push. Cost is elapsed time times the user-entered rate, not an official tariff calculation. These notes/photos are not collision avoidance or distance sensing. Center coverage now includes Valaoritou, Dioikitirio, Roman Forum, Agias Sofias, Navarinou, Agiou Dimitriou, Port, Emporiou, Venizelou/Egnatia, Tsimiski, Aggelaki, Archaeological Museum and Mitropoleos. Coordinates are area centroids, not surveyed individual parking places.

## Three parking estimators

`public/ensemble.js` combines contextual Bayesian estimation (50%), genuine online SGD logistic regression (30%) and up to 25 nearest similar observations (20%). Logistic features include cyclic hour, weekend, zone and named street; older evidence is downweighted. Coefficients and neighbor estimates rebuild deterministically from available observations, then update as reports arrive. Weights are design defaults, not empirically optimized. Individual outputs and disagreement are available; only Bayesian prequential Brier is evaluated in this version. No comparative accuracy claim is made for the ensemble. Probabilities remain hidden until contextual evidence is sufficient.

A named street gets its own model only with sufficient local evidence; otherwise the area model is explicitly labeled as a transfer estimate. Public road reports carry a stable zone+street-name hash, never private plate notes or photos. Street candidates exclude obvious primary/trunk/motorway classes and known no-parking tags, but map data do not establish permission to park. Unknown-signage roads are candidates to inspect, never confirmed legal bays. Without observations, candidate ordering is distance from area center, not a fabricated probability.

## Bundled geographic snapshot

`snapshots/city.json.gz` contains a deduplicated metro parking inventory and road geometry, derived from real OpenFreeMap vector tiles, release 2026-10-18. Includes OpenStreetMap data, © OpenStreetMap contributors, © OpenMapTiles, OpenFreeMap. Geographic database derivative distributed under ODbL 1.0: https://opendatacommons.org/licenses/odbl/1-0/ . This is map inventory, **not parking occupancy or training labels**. It lets the app work when Overpass is unavailable. Snapshot road geometry is served by selected area immediately; parking inventory may refresh separately when a provider responds. Layer and UI show map source date. No API key or account is needed: https://openfreemap.org/ .

Conservative cold-start candidate-name exclusions avoid central pedestrian-associated corridors (including all similarly named segments), without claiming legal restrictions for an entire street. Street legality still requires signage; overlay geometry is not a legal-bay inventory.

## Street exploration ranking and map reliability (21 October 2026)

When there are too few verified user reports to estimate the chance of a ten-minute search success, the road suggestions now use **mapped geometry only**: the distance to the *nearest portion* of the road, the aggregate mapped street-segment length within the area, and broad street class. Multiple segments of one named street are grouped. The listed distance is not distance to a legal bay; mapped length is not curbside parking capacity. Motorways, primary roads, footpaths and known restricted road tags are excluded from suggestions, without interpreting an untagged segment as legal. Streets with sufficient direct observations take priority, while geographic scoring is not represented as a probability or evidence of an empty space.

Routes without names now get distinct feedback identifiers by mapped feature ID rather than pooling every unnamed road in an area as if they were one road. This depends on map-source identifier stability for unnamed segments.

Inventory refresh retains the bundled snapshot unless a newer nonempty persisted inventory is available. Failed remote Overpass refreshes are retried with exponential backoff beginning at fifteen minutes (up to six hours), instead of making fresh outbound attempts for every client request. A stale inventory remains explicitly labeled stale; neither the snapshot nor the imagery is live parking occupancy.

Tests for the geometric-ranking helper live in `road-ranking.test.mjs`; the GitHub workflow runs the full `npm test` suite for pushes and pull requests.

## Aerial / satellite image learning lab — experimental

A new **Αεροφωτογραφίες · ML** tab provides:

- Direct OpenAerialMap STAC search scoped to a selected Thessaloniki neighborhood. Candidates must cover the area's center, have a dated observation, declared ground resolution <=0.8m/pixel and a displayed CC-BY-4.0 or CC-BY-SA-4.0 source license. The user may also upload a photo they are authorized to analyze; no Esri/Google basemap tile scraping.
- Actual pixel processing in-browser: spatial grid RGB/lightness/edge features from 40×40-image-pixel patches, human labels for *vehicle visible / no vehicle visible*, a deterministic regularized logistic image classifier trained from annotated patches, and out-of-scene holdout evaluation against a historical class-frequency baseline.
- The classifier only becomes available after a genuinely different held-out imagery scene contains both classes and beats the baseline on a Brier score. Training labels in an aerial photo identify vehicle-like visual patches, not parking legality, ownership, empty bays or up-to-date occupancy.
- **Unsupervised learning:** each distinct loaded aerial scene updates a locally stored rolling appearance profile for that area, even without manual labels, and shows a scene-difference signal when enough scenes exist. This is not a free-parking detector.
- Opt-in search for newer available images every six hours **only while the page remains open**. This is not a continuous server worker; no fresh imagery is guaranteed. The app does not claim satellite live capture or through-cloud visibility.
- Separate localStorage training-feature persistence, JSON export/import, and local model inference. Uploaded photos, GPS and number plates are not sent to the ARAXE backend. Feature vectors are derived from the pixels of submitted/available images. The first model trains per-device; crowd annotations are not yet aggregated across browsers.
- This lightweight image-patch classifier is intended as a foundation and does **not** match specialized object detection from orthorectified submeter imagery. It has not been calibrated in Thessaloniki and must not be connected to street availability forecasts until verified matched capture times, legal street bays, independent field observations and ongoing validation are available.

OpenAerialMap imagery API: https://docs.imagery.hotosm.org/usage/using-imagery/ . Each image's license and producer must be honored.

## Published parking price comparison

A price-comparison section in the sidebar offers quoted amounts for a chosen stay duration. Sources were manually verified 2026-10-21:
- THESi visitor bays 1.70 EUR/hour, four-hour sector limit, **only at signed municipal bays**: https://thesi.gr/
- HELEXPO Angellaki and Ioannis Vellidis: staged short-stay rates starting at EUR 5 for the first hour, EUR 8 for 1–2 hours, EUR 21 for 24h from the operator's **newer** tariff section: https://helexpo.gr/services/parking-spaces/
- Parking Vikas at Agiou Dimitriou 141: standard-car first hour EUR 4, second-hour increment EUR 2, 24h EUR 20: https://parkingvikas.gr/ . Missing price brackets are shown as unknown rather than interpolated.

Price information is only a published source quote, not real-time tariffs or bookings, and does not imply that the user can park in any street of the selected area. Municipal tariffs have time-of-day, holiday, residency and signage conditions not fully modeled by the simple calculator.

## Road-zone, traffic and satellite dashboard (21 October 2026)

The city/area sidebar now shows **real counts of candidate OSM road names**, four map-derived exploration tiers A–D, a numeric 0–100 **geometric exploration index** (not a vacancy probability), observed driver report counts for each modality and evidence-gated arrival-hour graphs. This index uses the documented mapped-road geometry, road class and shortest center-to-road distance. It does **not** identify legal curbside capacity, live occupancy or spaces seen from satellites. Primary roads, known restricted tags and pedestrian routes are excluded from candidate suggestions. Unknown parking signage is not taken as proof of legality. Multiple segments of one named road are grouped; tier counts sum to the actual number of unique candidate names. The zone map colors each suitable named road according to its geometry-derived tier and leaves excluded roads gray.

Traffic mode does **not** color roads using area-level predictions. It requires a sufficient number of genuine user-reported traffic observations for that specific road; no reports means gray. The traffic dashboard shows raw reported normal/slow/congested counts, an explicitly labeled conditional model severity 0–100 when trained and 0–4-hour model forecasts. Parking search forecasts are shown only if enough relevant observations exist; unknown values appear as dashes.

The dashboard links to **official TrafficThess** from CERTH/HIT for independently maintained live traffic conditions, typically updated every 15 minutes: https://trafficthess.imet.gr/ . Other useful official contextual maps: https://flyover.imet.gr/ . These external pages are not parsed into the app or represented as API-fed road speeds. The CERTH OpenData Hub currently advertises some traffic datasets as CC NonCommercial, and their API/redistribution terms and feed behavior must be checked before production ingestion. This version never fabricates live speeds or implies it has permission to republish them.

The OpenAerialMap toggle uses the public global OAM raster tile endpoint `https://global.imagery.hotosm.org/{z}/{x}/{y}.png` where coverage exists. It is a historical image view only, **not** an input to a parking-space classification model unless a particular source item supplies verified capture date, resolution and appropriate license. The visual-model tab automatically searches eligible OpenAerialMap scenes for the selected zone on opening; manual uploading is entirely optional. If no eligible imagery or legally matched parking ground truth exists, the satellite indicator stays unavailable. OAM sources: https://docs.imagery.hotosm.org/usage/using-imagery/ .

Validation: `road-intelligence.test.mjs` covers unique-road grouping, A–D classification, absence of manufactured congestion/parking predictions, independent traffic scopes and imagery provenance. UI modules are dependency-free and responsive. Free Render local SQLite remains ephemeral; independent official-traffic ingestion and persistent city-wide aerial training are future work, not represented as shipped functionality.
