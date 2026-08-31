# Database Backups (for revert)

Taken 2026-08-30 before cross-server study hours change + CI/CD fix.

| Backup | Location | Source |
|---|---|---|
| `database.sqlite.local-20260830-214856.bak` | `backups/` (this dir, local machine) | Local dev `database.sqlite` |
| `database.sqlite.vps-20260831-005015.bak` | `backups/` (this dir, local machine) | VPS production DB (downloaded copy) |
| `database.sqlite.20260831-005015.bak` | `~/studo-bot/backups/` on VPS (`botmaster@23.94.2.173`) | VPS production DB (taken via `sqlite3 .backup` while bot online) |

Pre-existing on VPS: `~/bkup.sqlite` (older, untouched).

## Revert procedure (VPS)

```bash
cd ~/studo-bot
pm2 stop studo-bot
cp backups/database.sqlite.20260831-005015.bak database.sqlite
pm2 start ecosystem.config.cjs
```
