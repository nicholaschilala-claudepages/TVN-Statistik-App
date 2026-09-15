# Cloud-Synchronisation einrichten (Firebase)

Diese Anleitung schaltet die App von "nur auf diesem Gerät gespeichert" auf
"synchronisiert sich automatisch zwischen all deinen Geräten" um – Tablet,
Handy und Laptop zeigen danach immer den gleichen Stand.

**Wichtig zu verstehen:**
- Die App bleibt während des Spiels **komplett offline nutzbar** – nichts an
  der Erfassung selbst ändert sich. Nur der Abgleich zwischen den Geräten
  passiert automatisch im Hintergrund, sobald wieder eine Internetverbindung
  besteht (z. B. vor/nach dem Spiel in der Halle, oder zuhause).
- Das Setup machst du **einmalig**. Danach musst du nichts mehr tun – die App
  synchronisiert sich von selbst.
- Ohne dieses Setup funktioniert die App weiterhin ganz normal, nur eben ohne
  Geräte-Abgleich (wie bisher). Solltest du die Schritte unten übersprungen
  oder falsch eingetragen haben, merkt die App das automatisch und fällt auf
  den bisherigen, rein lokalen Speicher zurück – sie stürzt nie deswegen ab.
- Dieses Setup gilt nur für die **installierte/selbst gehostete Version**
  (die Dateien in diesem Paket, z. B. über GitHub Pages gehostet). Der
  separate Claude-Testlink ("Artifact") kann aus technischen Gründen keine
  Cloud-Synchronisation nutzen – dort bleibt es bei der reinen Testvorschau.

## Schritt 1: Firebase-Projekt anlegen

1. Gehe zu [console.firebase.google.com](https://console.firebase.google.com)
   und melde dich mit einem Google-Konto an (dein normales Google-Konto reicht).
2. Klicke auf **"Projekt hinzufügen"**.
3. Vergib einen Namen, z. B. `tvn-spielstatistik`. Google Analytics für dieses
   Projekt kannst du deaktivieren (wird nicht gebraucht).
4. Warte, bis das Projekt erstellt ist.

## Schritt 2: Firestore-Datenbank aktivieren

1. Klicke im linken Menü auf **"Build" → "Firestore Database"**.
2. Klicke auf **"Datenbank erstellen"**.
3. Wähle einen Standort in deiner Nähe (z. B. `eur3 (europe-west)`).
4. Starte im **"Produktionsmodus"** (die Sicherheitsregeln passen wir in
   Schritt 5 ohnehin an).

## Schritt 3: Anonyme Anmeldung aktivieren

Das schützt deine Daten davor, dass Fremde sie lesen oder verändern können,
ohne dass du dich selbst jedes Mal einloggen musst.

1. Klicke im linken Menü auf **"Build" → "Authentication"**.
2. Klicke auf **"Los geht's"** bzw. **"Sign-in method"**.
3. Aktiviere den Anbieter **"Anonym"** (in der Liste ganz unten).

## Schritt 4: Web-App registrieren & Konfigurationsdaten holen

1. Klicke oben auf das Zahnrad-Symbol → **"Projekteinstellungen"**.
2. Scrolle zu **"Meine Apps"** und klicke auf das Web-Symbol (`</>`).
3. Vergib einen App-Spitznamen, z. B. `TVN Stats App`. Häkchen bei "Firebase
   Hosting" brauchst du **nicht** zu setzen.
4. Du bekommst einen Codeblock namens `firebaseConfig` angezeigt, etwa so:

   ```js
   const firebaseConfig = {
     apiKey: "AIzaSy...",
     authDomain: "tvn-spielstatistik.firebaseapp.com",
     projectId: "tvn-spielstatistik",
     storageBucket: "tvn-spielstatistik.appspot.com",
     messagingSenderId: "123456789",
     appId: "1:123456789:web:abcdef123456"
   };
   ```

5. Öffne die Datei **`app.js`** aus diesem App-Paket in einem Texteditor und
   suche ganz am Anfang nach `FIREBASE_CONFIG`. Ersetze die Platzhalter-Werte
   durch deine eigenen sechs Werte von oben:

   ```js
   const FIREBASE_CONFIG = {
     apiKey: "AIzaSy...",
     authDomain: "tvn-spielstatistik.firebaseapp.com",
     projectId: "tvn-spielstatistik",
     storageBucket: "tvn-spielstatistik.appspot.com",
     messagingSenderId: "123456789",
     appId: "1:123456789:web:abcdef123456",
   };
   ```

6. Speichern. Die App erkennt automatisch, dass jetzt echte Werte eingetragen
   sind, und schaltet beim nächsten Laden auf Cloud-Synchronisation um.

## Schritt 5: Sicherheitsregeln setzen

1. Zurück zu **"Firestore Database" → Reiter "Regeln"**.
2. Ersetze den Inhalt durch:

   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /{document=**} {
         allow read, write: if request.auth != null;
       }
     }
   }
   ```

3. Klicke auf **"Veröffentlichen"**.

   Das erlaubt Lesen/Schreiben nur für angemeldete Nutzer – die App meldet
   sich dafür automatisch anonym im Hintergrund an (aus Schritt 3). Das ist
   ein solider Basisschutz für ein internes Team-Tool, aber kein
   Bank-Sicherheitsniveau (jeder mit Zugriff auf deine `FIREBASE_CONFIG`-Werte
   könnte sich technisch ebenfalls anonym anmelden). Für die Zwecke dieser
   App völlig ausreichend.

## Schritt 6: Hochladen & einmalig mit Internet öffnen

1. Lade die aktualisierten Dateien (mindestens `app.js`) dorthin hoch, wo du
   die App hostest (z. B. GitHub Pages).
2. Öffne die App **einmal mit bestehender Internetverbindung** (z. B. zuhause
   im WLAN). Das ist nötig, damit sich das Gerät einmalig bei Firebase
   anmelden kann – danach funktioniert auch das ganz normal offline weiter,
   die Anmeldung wird gespeichert.
3. Prüfe auf dem Startbildschirm den kleinen Hinweis unter dem Saison-Namen:
   - ☁️ **"Cloud-Synchronisation aktiv"** → alles eingerichtet.
   - ⚠️ **"Cloud-Sync-Fehler"** → einer der Schritte oben wurde noch nicht
     korrekt ausgeführt (z. B. Regeln nicht veröffentlicht, oder ein Wert in
     `FIREBASE_CONFIG` falsch abgetippt). Die App speichert in diesem Fall
     trotzdem ganz normal lokal weiter, es gehen keine Daten verloren.
4. Wiederhole Schritt 6.2 einmal auf jedem weiteren Gerät (Tablet, Handy,
   Laptop), das du nutzen willst.

Danach kannst du beliebig zwischen den Geräten wechseln – neue Einträge,
neue Spieler, abgeschlossene Spiele usw. erscheinen automatisch auf allen
anderen Geräten, sobald diese wieder online sind.

## Kosten

Der kostenlose Firebase-Tarif ("Spark") reicht für dieses Einsatzszenario
bei Weitem aus (Kontingente weit über dem, was ein Handball-Team an
Statistikdaten pro Saison erzeugt) – es fallen keine Kosten an, solange du
kein kostenpflichtiges Upgrade auswählst.
