#!/bin/sh
# Tạo DB phụ cho n8n, NocoDB, Metabase (DB "leads" do POSTGRES_DB tạo sẵn)
set -e
for db in n8n nocodb metabase; do
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
    -c "CREATE DATABASE $db OWNER \"$POSTGRES_USER\";"
done
