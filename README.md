# Motorklang – kostenloser Sportwagen-Sound für den Tesla

Eine Web-App für den Tesla-Browser. Sie spielt beim Fahren Sportwagen-Motorsound über die Lautsprecher im Innenraum.
Das Tempo kommt vom **GPS**. Daraus berechnet die App Drehzahl, Gang, Last, Schaltvorgänge, Zwischengas und
Schubphasen. Der Klang wird **live im Browser berechnet**: Es gibt keine Abo-Kosten, kein Konto und keinen Server.

**Adresse (nach dem Einrichten, siehe unten):** https://brunder3.github.io/Nostra-Aetate/

## Funktionen

- **14 Motoren** mit eigener Zündfolge, Krümmer- und Auspuffakustik:
  AMG-V8-Biturbo, Muscle-V8, Supercharged-V8 (Kompressor-Heulen), Ferrari-V12, Flat-Plane-V8,
  Lamborghini-V10, Porsche-GT3-Boxer, BMW-M-Reihensechser, Supra 2JZ (Blow-Off), Audi-Fünfzylinder,
  Subaru-Boxer-Grollen, Wankel-Twin-Rotor, GT-R-V6-Biturbo und Formel-1-V10 (19.000 U/min).
- **Realistisches Getriebe** je Fahrzeug (DCT, PDK, Automatik oder Handschalter) mit echten Übersetzungen.
  Die Schaltpunkte hängen vom Fahrstil ab. Beim Runterschalten gibt es Zwischengas, beim Hochschalten
  unter Volllast eine Zündunterbrechung.
- **Pops & Bangs** im Schub, **Turbo-Pfeifen**, **Blow-Off** (Zischen oder Flattern), **Drehzahlbegrenzer**.
- **Klappenauspuff** auf/zu, Bass- und Höhenregler, Fahrstil von gemütlich bis Rennstrecke.
- **Manuell schalten** mit den Wippen + / −.
- **Gas-Knopf**: im Stand gedrückt halten, um hochzudrehen.
- **Testfahrt-Modus**: alles ohne Fahren ausprobieren.
- **Sound-Packs**: Eigene echte Aufnahmen lassen sich als Fahrzeug hinzufügen (siehe unten).
- Funktioniert nach dem ersten Laden auch bei schlechtem Netz (Offline-Cache).

## Einmalig einrichten: GitHub Pages einschalten

1. Im Repository auf **Settings → Pages** gehen.
2. Bei *Build and deployment* unter **Source** „Deploy from a branch“ wählen.
3. Bei **Branch** den Branch mit dieser App wählen (`main`, sobald gemergt, sonst
   `claude/tesla-sound-simulator-gps-qp3m0e`), Ordner **`/ (root)`**, dann **Save** klicken.
4. Nach 1–2 Minuten ist die Seite unter **https://brunder3.github.io/Nostra-Aetate/** erreichbar.

## Im Tesla benutzen

1. Den Tesla-Browser öffnen und die Adresse eingeben. Tipp: als Favorit speichern.
2. Fahrzeug antippen und dann **Motor starten** tippen.
3. Bei der Frage nach dem Standort auf **Zulassen** tippen.
4. Losfahren.

Tipps:
- Den Browser geöffnet lassen, z. B. auf der halben Bildschirmseite neben der Karte. Ist der Browser ganz
  zu, kann der Ton stoppen.
- Die Fahrzeug-Lautstärke regelst du wie gewohnt am Lenkrad. Mit dem Regler in der App stellst du die
  Lautstärke im Verhältnis zu Musik und Navigation ein.
- GPS liefert etwa einmal pro Sekunde einen Wert. Zwischen den Messungen rechnet die App die Bewegung
  voraus. Ganz ohne Verzögerung geht es mit GPS trotzdem nicht: Beim harten Beschleunigen reagiert der
  Sound etwa eine halbe bis eine Sekunde später.
- Der Ton kommt nur aus den Lautsprechern im Innenraum, nicht aus dem Außenlautsprecher (Boombox).
  Bitte die Lautstärke so wählen, dass Martinshörner und Warnsignale hörbar bleiben.

## Wie der Klang entsteht

Es werden keine fertigen Tonschnipsel abgespielt. Die App simuliert den Motor physikalisch inspiriert
(`js/engine-worklet.js`):

1. **Verbrennungsimpulse** pro Zylinder in der echten Zündfolge, mit Lastabhängigkeit und kleinen
   Schwankungen von Zyklus zu Zyklus, wie bei einem echten Motor.
2. **Krümmer**: Jeder Zylinder hat eine eigene Laufzeit bis zum Sammler.
   Ungleich lange Krümmer erzeugen das Subaru-Grollen.
3. **Bankaufteilung**: Beim Cross-Plane-V8 kommen die Impulse pro Auspuffstrang ungleichmäßig an. Das ist
   das typische V8-Blubbern. Ein Flat-Plane-V8 oder V12 zündet pro Bank gleichmäßig und klingt deshalb
   kreischend.
4. **Rohre** als akustische Wellenleiter mit Reflexion und Dämpfung. Dadurch entstehen Resonanzen und
   Dröhnbereiche.
5. **Schalldämpfer** mit Helmholtz-Resonanz und Klappe, dazu die Abstrahlung an der Mündung.
6. **Ansauggeräusch**, Ventiltrieb, Turbo, Kompressor, Blow-Off, Nachverbrennung (Pops) und Begrenzer.

Die Fahrdynamik (`js/drivetrain.js`) rechnet aus Tempo und Beschleunigung den Gang, die Drehzahl und die
Motorlast. Die GPS-Auswertung mit Glättung und Vorhersage steckt in `js/gps.js`.

## Echte Aufnahmen hinzufügen (Sound-Packs)

Ein Sound-Pack besteht aus kurzen Aufnahmen bei jeweils **konstanter Drehzahl**, z. B. 1000, 2000 …
7000 U/min. Am besten nimmt man je eine Aufnahme unter Last (`on`) und optional eine im Schub (`off`).
Beim Fahren passt die App die Tonhöhe an und blendet zwischen den zwei nächstgelegenen Aufnahmen über.
So machen es auch Rennspiele. Die Schnipsel müssen **nicht** nahtlos geschnitten sein, das erledigt die
App beim Laden.

### Ordnerstruktur

```
packs/
  index.json              ← { "packs": ["mein-v8"] }
  mein-v8/
    pack.json
    on_1000.mp3
    on_2500.mp3
    ...
```

### `pack.json`

```json
{
  "name": "Mein V8 (Aufnahme)",
  "sub": "Echte Aufnahme · V8",
  "credit": "Aufnahme: <Urheber>, Lizenz CC0 (freesound.org/…)",
  "base": "amg-v8",
  "idle": 750,
  "redline": 6800,
  "limiter": 7000,
  "gain": 1.0,
  "mixSynth": 0.15,
  "loops": [
    { "rpm": 1000, "on": "on_1000.mp3", "off": "off_1000.mp3" },
    { "rpm": 2500, "on": "on_2500.mp3" },
    { "rpm": 4000, "on": "on_4000.mp3" },
    { "rpm": 5500, "on": "on_5500.mp3" },
    { "rpm": 6800, "on": "on_6800.mp3" }
  ]
}
```

- `base`: Von diesem Synthese-Fahrzeug werden Getriebe und Grunddaten übernommen.
  Mögliche IDs stehen in `js/cars.js`, z. B. `amg-v8`, `ferrari-v12`, `gt3-flat6`.
- `mixSynth`: Anteil der Synthese, der leise unter die Aufnahme gemischt wird (0 bis 1). Dadurch bleiben
  Pops, Turbo und Blow-Off erhalten.
- Ohne `off`-Aufnahme verwendet die App im Schub die Lastaufnahme, gedämpft.

### Schnipsel vorbereiten (z. B. mit Audacity)

1. Eine Aufnahme suchen, in der der Motor auf verschiedenen Drehzahlen **gehalten** wird. Stand- oder
   Prüfstandaufnahmen mit Gasstößen eignen sich gut.
2. Je Drehzahlstufe 1–3 Sekunden mit gleichbleibendem Ton markieren und über *Datei → Exportieren*
   als MP3 oder OGG speichern.
3. Die Drehzahl bestimmen: In Audacity unter *Analyse → Frequenzanalyse* den tiefsten deutlichen Peak f
   (Zündfrequenz) ablesen. Dann gilt: **Drehzahl = f × 120 ÷ Zylinderzahl** (beim Wankel: f × 60 ÷ Scheiben).
   Beispiel V8 mit 200 Hz ergibt 3000 U/min.
4. Auf GitHub den Ordner unter `packs/` anlegen (*Add file → Upload files*), die `pack.json` dazulegen
   und den Ordnernamen in `packs/index.json` eintragen. Das Pack erscheint dann als Fahrzeug mit dem
   Etikett „Aufnahme“.

### Gute kostenlose Quellen für Aufnahmen

| Quelle | Lizenz | Hinweis |
|---|---|---|
| [Freesound.org](https://freesound.org/search/?q=engine+rev&f=license%3A%22Creative+Commons+0%22) | im Filter **CC0** wählen | Riesige Auswahl, viele Aufnahmen bestimmter Autos. Suchbegriffe z. B. „V8 rev“, „engine idle rev“, „flat six“, „V12 rev“. Kostenloses Konto nötig. |
| [Pixabay Soundeffekte](https://pixabay.com/sound-effects/search/car%20engine/) | Pixabay-Lizenz (frei nutzbar) | Gute Rev- und Motor-Aufnahmen, ohne Namensnennung. |
| [Sonniss GDC Game Audio Bundle](https://sonniss.com/gameaudiogdc) | lizenzfrei, auch kommerziell | Jährliche kostenlose Profi-Sammlungen, oft mit Fahrzeugaufnahmen. In der Titelliste nach „Vehicle“/„Car“ suchen. |
| [BBC Sound Effects](https://sound-effects.bbcrewind.co.uk/search?q=car%20engine) | RemArc: **nur privat, Bildung, Forschung** | Viele, teils klassische Sportwagen. Weil dieses Repository öffentlich ist, solche Dateien lieber nur lokal oder in einem privaten Fork nutzen. |

Wichtig: Dieses Repository ist **öffentlich**. Alles unter `packs/` ist damit für jeden abrufbar.
Am unkompliziertesten sind deshalb CC0- oder Pixabay-Aufnahmen. Keine Dateien aus kostenpflichtigen
Apps oder Spielen übernehmen.

## Entwicklung

- Reines HTML, CSS und JavaScript ohne Build-Schritt und ohne externe Abhängigkeiten.
- Lokal testen: `python3 -m http.server` im Ordner starten und `http://localhost:8000` öffnen.
  Für GPS braucht der Browser HTTPS oder localhost.
- Hörproben ohne Browser erzeugen: `node tools/render.mjs all 30 ./hoerproben` schreibt WAV-Dateien mit
  der Testfahrt.
- Am PC: **Leertaste** = Gas, **Pfeil hoch/runter** = schalten (im manuellen Modus).

Weitere Datei im Repository: [`online_viewer_net.html`](online_viewer_net.html). Zum Ansehen hier
einfügen: https://html.onlineviewer.net
