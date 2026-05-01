# 🤖 Dizzle Store

Android App Distribution Platform – selbst gehostet, Docker-ready.

## Features

- 🔐 Admin-Login mit JWT
- 📱 Apps anlegen mit Icon, Beschreibung & Kategorie
- 📦 APK-Releases hochladen (mit Drag & Drop, Upload-Fortschritt)
- ⬇️ Download-Zähler pro Release
- 🔍 App-Suche
- 📊 Admin-Dashboard mit Statistiken
- 🐳 Docker-ready

## Schnellstart mit Docker

```bash
# 1. Starten
docker-compose up -d

# 2. Im Browser öffnen
open http://localhost:3000
```

Standard-Login: `admin` / `dizzle2024`

## Konfiguration

In `docker-compose.yml` unter `environment`:

| Variable         | Standard       | Beschreibung              |
|------------------|----------------|---------------------------|
| `ADMIN_USERNAME` | `admin`        | Admin-Benutzername        |
| `ADMIN_PASSWORD` | `dizzle2024`   | Admin-Passwort            |
| `JWT_SECRET`     | *(ändern!)*    | JWT-Signierungsschlüssel  |
| `PORT`           | `3000`         | Server-Port               |

## Lokale Entwicklung

```bash
npm install
node server.js
```

## Daten

- APKs und Icons werden in Docker-Volumes gespeichert (`dizzle-uploads`, `dizzle-data`)
- Daten bleiben beim Container-Neustart erhalten
- Backup: `docker cp dizzle-store:/app/data ./backup-data`
