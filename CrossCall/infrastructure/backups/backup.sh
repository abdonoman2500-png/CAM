#!/usr/bin/env bash
set -euo pipefail

# CrossCall PostgreSQL Automated Backup Script (run via cron on Ubuntu VPS)
BACKUP_DIR="${BACKUP_DIR:-/var/backups/crosscall}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT_FILE="${BACKUP_DIR}/crosscall_${TIMESTAMP}.sql.gz"

mkdir -p "${BACKUP_DIR}"
docker exec crosscall-postgres pg_dump -U "${POSTGRES_USER:-crosscall_app}" -d "${POSTGRES_DB:-crosscall}" --no-owner --no-acl | gzip > "${OUT_FILE}"
chmod 600 "${OUT_FILE}"

# Prune backups older than retention window
find "${BACKUP_DIR}" -name "crosscall_*.sql.gz" -type f -mtime +"${RETENTION_DAYS}" -delete
echo "[CrossCall Backup] Completed ${OUT_FILE}"
