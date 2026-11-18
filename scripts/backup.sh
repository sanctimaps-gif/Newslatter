#!/bin/sh
# Sauvegarde PostgreSQL compressée, rotation 14 jours.
# Usage : PGHOST=… PGUSER=newsletter PGPASSWORD=… sh scripts/backup.sh /chemin/sauvegardes
# Restauration : voir documentation/installation.md (« Restaurer »).
set -eu
DEST="${1:-./backups}"
mkdir -p "$DEST"
FILE="$DEST/newsletter-$(date -u +%Y%m%d-%H%M%S).dump"
pg_dump -h "${PGHOST:-localhost}" -U "${PGUSER:-newsletter}" -d "${PGDATABASE:-newsletter}" -Fc -f "$FILE"
pg_restore --list "$FILE" > /dev/null   # vérifie que l'archive est lisible
find "$DEST" -name 'newsletter-*.dump' -mtime +14 -delete
echo "Sauvegarde OK : $FILE"
