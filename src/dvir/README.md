# Inspector DVIR — Geotab Drive Add-In (Starter)

This is a **static, client-only** Drive Add-In that lets inspectors complete checklists (DVIRs)
for **any asset** without reassigning the driver’s active vehicle.

> Works by **calling the MyGeotab JS API directly** to create `DVIRLog` (and `DVIRDefect`) records,
> instead of using Drive’s native inspection flow (which reassigns vehicles).

---

## What’s included
- `manifest.json` — Remote Add-In manifest (MyGeotab → System Settings → Add-Ins).
- `index.html` — Minimal UI (filters, asset picker, readings, submit).
- `inspector.js` — Core logic (API calls, ignition reminder, defect posting).
- `styles.css` — Lightweight styling.
- `config.json` — Feature flags and defaults (tweak without touching code).
- `icon.svg` — Menu icon.

## Quick start (GitHub Pages example)
1. Create a **public repo** (e.g., `inspector-dvir-addin`).
2. Commit these files at the repo root and enable **GitHub Pages** (Deploy from `main` / root).
3. Note your Pages URL (e.g., `https://<user>.github.io/inspector-dvir-addin/`).

### Add to MyGeotab
1. Log in as **Admin** → **Administration → System → System Settings → Add-Ins**.
2. Click **New** → set **Configuration source** = **Remote** and paste your manifest URL:
   `https://<user>.github.io/inspector-dvir-addin/manifest.json`
3. Save. Assign visibility to your **Inspector** role/users.
4. Open **Geotab Drive** → Menu → _Inspector DVIR_.

## Permissions & Roles
Create/ensure a role for inspectors with:
- **Read**: Device, Group, Zone
- **Add**: DVIRLog, DVIRDefect
- (Optional) Restrict by Groups (e.g., Heavy Equipment only).
- They **should not** have permissions to change driver-vehicle assignments.

## Notes
- Photos are referenced by URL (you can integrate S3/SharePoint/Drive). The example keeps it simple.
- The ignition reminder uses `GetFeed(StatusData)` and a 5-minute timer (adjustable). It shows a Drive notification.
- Hubodometer is recorded in DVIR remarks and included in your webhook payload if configured.

## Support
- Update `config.json` for: reminder scope, minutes, defect email/webhook settings, and UI toggles.
- The code is intentionally small and heavily commented for you to extend.

Enjoy! — Updated: 2025-10-01
