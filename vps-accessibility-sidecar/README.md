# Védett Útvonal — VPS Accessibility Lookup Sidecar (Task C3)

Kis footprintű, keretrendszer nélküli Node process a VPS-en (159.195.255.146).
A canonical BKK GTFS zipből (`/srv/vedett-route/input/bkk_gtfs.zip` — **ugyanaz**
a fájl, amit a MOTIS is használ) épített accessibility indexet szolgálja ki
server-to-server lookupként a Next.js szerver felé, hogy az **soha ne** töltse
le/parse-olja a teljes (>200k rekord) indexet kérésenként.

A browser **soha** nem éri el ezt a sidecart közvetlenül. Flow:

```
Browser -> Next.js szerver -> https://route.vedettsarok.hu (Caddy) -> 127.0.0.1:8082 (ez a sidecar)
```

## Miért nincs deployolva még

Ez a kör (Task C3) **szándékosan** nem nyúl a VPS-hez. A build/tesztelés a
Claude sandbox-ban történt. Az alábbi lépések azt írják le, hogyan kellene
(egy KÖVETKEZŐ, külön jóváhagyott körben) a VPS-re telepíteni — de **semmi
ebből nem futott le a valódi VPS-en**.

## 1. Build

```bash
cd /opt/vedett-route-accessibility-sidecar   # javasolt telepítési útvonal
npm ci --omit=dev
npm install --no-save typescript@5.5.4 @types/node@20.14.2   # build-time only
npx tsc -p tsconfig.json
```

A `dist/` mappa lesz a futtatható JS. `npm ci --omit=dev` után a `dist/`
könyvtár + a runtime `adm-zip` dependency elég a futáshoz — a TypeScript
csak a buildhez kell, futásidőben nem.

## 2. Az index első build-je

```bash
node dist/buildIndex.js bkkgtfs /srv/vedett-route/input/bkk_gtfs.zip
```

Ez létrehozza (ha még nincs):

```
/srv/vedett-route/accessibility/bkkgtfs/
  generations/<sha256-16hex>/manifest.json
  generations/<sha256-16hex>/accessibility-index.json
  active-generation.txt
```

**Fontos**: ha a `/srv/vedett-route/accessibility` könyvtárnak más a
tulajdonosa/jogosultsága, mint a sidecar-t futtató systemd usernek, a build
ezen a ponton hibázik — ezt a telepítést végző admin-nak a tényleges VPS
jogosultságok szerint kell beállítania (ez NEM feltételezhető innen).

## 3. Environment változók

| Változó | Kötelező | Leírás |
|---|---|---|
| `ACCESSIBILITY_SIDECAR_AUTH_TOKEN` | igen | Bearer token, amit a Caddy/Next.js oldal is ismer. **Külön** secret, mint a `ROUTE_SERVICE_AUTH_TOKEN` — sosem ugyanaz. |
| `ACCESSIBILITY_SIDECAR_PORT` | nem (default 8082) | localhost-only bind port. |
| `ACCESSIBILITY_SIDECAR_DATASETS` | nem (default "bkkgtfs") | vesszővel elválasztott dataset-lista. |
| `ACCESSIBILITY_DATA_ROOT` | nem (default `/srv/vedett-route/accessibility`) | csak teszteléshez érdemes felülírni. |

A token generálásához: `openssl rand -hex 32`.

## 4. systemd unit (javasolt, NEM telepítve)

`/etc/systemd/system/vedett-accessibility-sidecar.service`:

```ini
[Unit]
Description=Vedett Utvonal accessibility lookup sidecar
After=network.target

[Service]
Type=simple
User=vedett-route          # a MEGLÉVŐ, MOTIS-t is futtató user, HA az már létezik és jogosult az /srv/vedett-route/accessibility írására — ellenkező esetben egy dedikált, nem-root user
WorkingDirectory=/opt/vedett-route-accessibility-sidecar
EnvironmentFile=/etc/vedett-route/accessibility-sidecar.env   # tartalmazza az ACCESSIBILITY_SIDECAR_AUTH_TOKEN-t, SOHA nem git-be
ExecStart=/usr/bin/node dist/server.js
Restart=on-failure
RestartSec=5
# Védelmi háló, ha a fenti user-nek explicit külön jogot kell adni:
# NoNewPrivileges=true

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now vedett-accessibility-sidecar
sudo systemctl status vedett-accessibility-sidecar
curl http://127.0.0.1:8082/health
```

## 5. Caddy route (javasolt kiegészítés, NEM telepítve)

A MEGLÉVŐ route.vedettsarok.hu Caddy blokkjához egy ÚJ, szűk útvonal
hozzáadása — a jelenlegi konvenciót követve (csak a szükséges endpoint
proxyolva, lásd `docs/vedett-route/VPS_STAGING_INTEGRATION_GATE.md`):

```caddy
route.vedettsarok.hu {
  # ... meglévő /api/v6/plan és /api/v1/health blokkok, VÁLTOZATLANUL ...

  handle /accessibility/lookup {
    reverse_proxy 127.0.0.1:8082 {
      # A Bearer Authorization fejlécet a Next.js szerver már beállítja,
      # a Caddy csak továbbítja — nem generál/ellenőrzi újra.
    }
  }
}
```

A sidecar `/health` endpointja SZÁNDÉKOSAN nincs a nyilvános Caddy mögé
kitéve ebben a tervben (csak `curl localhost` a VPS-en, systemd/monitoring
célra) — ha mégis kellene, egy KÜLÖN, publikus `/accessibility/health`
route adható hozzá, mert a `/health` válasz nem tartalmaz secretet.

## 6. Rebuild egy új GTFS feltöltés után

```bash
node dist/buildIndex.js bkkgtfs /srv/vedett-route/input/bkk_gtfs.zip
```

- Ha a zip TARTALMA nem változott: a hívás idempotens (nem épít újra,
  csak visszaadja a meglévő manifestet).
- Ha változott: ÚJ generation épül, VALIDÁLVA íródik, majd csak SIKERES
  validáció után aktiválódik (`active-generation.txt` atomikus frissítése).
  A sidecar process maga poll-olja ezt a pointer fájlt (10 mp-enként) —
  NEM kell újraindítani a szolgáltatást egy index-frissítéshez.
- Sikertelen build esetén a KORÁBBI, jó generation marad aktív — a
  folyamat nonzero exit code-dal jelez, de nem bont semmit.

## 7. Health check / megfigyelés

```bash
curl http://127.0.0.1:8082/health
```

Válasz minden dataset-re: `{provider, dataset, generation, builtAt,
stopCount, tripCount, pathwayCount, status}`. SOHA nem tartalmaz
secretet/koordinátát/felhasználói adatot.

## 8. Rollback

A `generations/` könyvtár SOHA nem törli automatikusan a korábbi
build-eket. Egy rossz aktiváció esetén:

```bash
ls /srv/vedett-route/accessibility/bkkgtfs/generations/
# válaszd ki a korábbi, jó generation hash-t, majd:
echo -n "<korábbi-jó-generation-hash>" > /tmp/rollback.txt
mv /tmp/rollback.txt /srv/vedett-route/accessibility/bkkgtfs/active-generation.txt
```

(A `mv` ugyanazon a fájlrendszeren belül atomikus — ugyanaz a garancia,
mint amit a `buildIndex.ts` maga is használ.) A sidecar a következő
poll-ciklusban (legfeljebb ~10 mp) felveszi a visszaállított generationt.

**Backup**: a `generations/` könyvtár egyetlen fájlja sem törlődik
automatikusan — ez ÖNMAGÁBAN a backup egy rossz build/aktiváció ellen.
A `/srv/vedett-route/input/bkk_gtfs.zip`-re vonatkozó backup-politika a
MOTIS-ét követi (lásd `docs/vedett-route/PRODUCTION_DEPLOYMENT.md`), ezt a
sidecar nem duplikálja.

## 9. Tesztek

```bash
npm run build
node --test dist-test/**/*.test.js   # vagy: node --test test/*.test.ts (Node 22 natív TS-stripping)
```
