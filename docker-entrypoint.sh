#!/bin/sh
set -e

if [ "$1" = "web" ]; then
  echo "Aplicando migrações do banco..."
  npx prisma migrate deploy
  npx tsx prisma/seed.ts
  exec npx next start -p 3000
elif [ "$1" = "worker" ]; then
  # espera o app aplicar as migrações
  sleep 10
  exec npx tsx src/worker/index.ts
else
  exec "$@"
fi
