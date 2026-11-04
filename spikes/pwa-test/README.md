# Phase 0: PWA-Machbarkeitstest

Kleine Wegwerf-App, die auf dem echten iPhone und Android-Gerät prüft, was die geplante
React-PWA dort leisten kann (siehe Architekturbericht). Sie ist bewusst **nicht** mit Supabase
verbunden und sendet keine Daten an einen Server. Eine geladene KML-Datei bleibt auf dem Gerät.

Geprüft wird:

| Test | Was die App macht |
| --- | --- |
| Offline-Start | Service Worker speichert die App; sie startet im Flugmodus |
| Offline-Karte | lädt Kacheln für das Revier in den Cache (Karte: basemap.de, Luftbild: Geobasis NRW) und zeigt sie ohne Netz |
| KML/GPX-Import | liest eine Reviergrenze im Browser ein und zeigt sie auf der Karte |
| GPS | `watchPosition`, Genauigkeit, und misst, ob bei gesperrtem Bildschirm Positionen ankommen |
| Display wachhalten | Wake Lock API |
| Benachrichtigungen | lokale Benachrichtigung und echte Web-Push-Anmeldung |
| Meldung ohne Netz | speichert eine Testmeldung in IndexedDB, die einen Neustart überlebt |
| Speicher | Kontingent, belegter Platz, `navigator.storage.persist()` |

## Testablauf auf dem iPhone

1. Die Adresse in **Safari** öffnen, **Teilen → Zum Home-Bildschirm**, dann die App über das neue Symbol starten.
2. Unter *Status* auf **Speicher dauerhaft schützen** tippen.
3. Optional **KML/GPX laden** und die Reviergrenze wählen (zum Beispiel über iCloud Drive). Ohne Datei wird ein Standardgebiet um den Reviermittelpunkt geladen.
4. Im WLAN **Offline-Paket laden** (bis Zoom 17 etwa 30 bis 60 MB).
5. **Flugmodus an**, die App ganz schließen (nach oben wegwischen), neu öffnen. Sind Karte und Luftbild da?
6. Im Flugmodus **Testmeldung speichern**, App schließen, wieder öffnen. Ist die Meldung noch da?
7. **GPS starten**, Position prüfen. Bildschirm 2 Minuten sperren, entsperren. Die App zeigt die Pause und wie viele Positionen in der Zeit ankamen.
8. **Display wachhalten** einschalten und das Handy 5 Minuten liegen lassen.
9. **Lokale Testbenachrichtigung**, dann **Push abonnieren**; den angezeigten Text im Chat schicken, dann kommt eine echte Push-Nachricht.
10. **Ergebnis kopieren** und im Chat einfügen.
11. Nach zwei bis drei Tagen ohne Benutzung die App im Flugmodus öffnen: Ist das Kartenpaket noch da?

## Entwicklung

```bash
npm ci
npm test            # Kachel-Mathematik (Vitest)
npm run dev         # http://localhost:5173
npm run build && npx vite preview --port 4173 &
npm run e2e         # Rauchtest mit Playwright (Offline-Start, Offline-Karte, GPS, Meldung)
```

`npm run e2e` braucht Playwright mit Chromium; es wird nicht als Abhängigkeit installiert, sondern
global erwartet (`NODE_PATH=$(npm root -g)`).

Veröffentlicht wird automatisch über `.github/workflows/pages.yml` auf GitHub Pages,
sobald Änderungen in `main` landen. Einmalig muss im Repository unter
*Settings → Pages → Source* **GitHub Actions** ausgewählt werden.

Kartendaten: © GeoBasis-DE / BKG (CC BY 4.0), © Geobasis NRW (Datenlizenz Deutschland Zero 2.0).

Der Ordner wird nach Phase 0 nicht weiterentwickelt; die eigentliche App entsteht in Phase 1 unter `web-app/`.
