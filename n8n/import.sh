#!/bin/sh
# Chạy bên trong container n8n:  docker compose exec n8n sh /import/import.sh
# - Tạo credential "Leads Postgres" (lấy user/pass từ biến môi trường, không ghi ra repo)
# - Import / cập nhật 2 workflow
set -e
TMP=$(mktemp)
node -e '
const e = process.env;
process.stdout.write(JSON.stringify([{
  id: "LhLeadsPostgres1", name: "Leads Postgres", type: "postgres",
  data: { host: "postgres", port: 5432, database: e.LH_PG_DB,
          user: e.LH_PG_USER, password: e.LH_PG_PASSWORD, ssl: "disable" }
}]));' > "$TMP"
n8n import:credentials --input="$TMP"
rm -f "$TMP"
n8n import:workflow --separate --input=/import/workflows
echo "✅ Import xong. Mở http://localhost:5678"
