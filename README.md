# Riftbound Sealed Scripts

Operational scripts for the Riftbound Sealed ecosystem — built to run locally or as DigitalOcean App Platform **Scheduled Jobs**.

This repo is intended to grow over time: each "script" lives in its own folder with its own runtime/dependencies so we can deploy and schedule them independently.

> **Disclaimer**: Riftbound / Riot Games assets and trademarks belong to Riot Games. Riot Games does not endorse nor sponsor this project.

---

## What’s in this repo

### Jobs / Scripts

| Job | Path | What it does |
|-----|------|--------------|
| **Card Image CDN Sync** | `scripts/upload-cards.ts` | Fetches card metadata from Riftcodex and ensures card images exist in a DigitalOcean Space (served via CDN). Uploads missing images to `s3://<space>/cards/<SET>-<###>.webp`. |

---
