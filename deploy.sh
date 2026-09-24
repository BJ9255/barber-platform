#!/bin/bash
# Déploie le site en production sur Vercel (https://barber-rdv-baptiste.vercel.app)
set -e

cd "$(dirname "$0")"

echo "🔎 Vérification du code..."
npx tsc --noEmit
npx eslint app lib

echo "👤 Compte Vercel :"
if ! npx vercel whoami; then
    echo "Connexion à Vercel requise..."
    npx vercel login
fi

echo "🚀 Déploiement en production..."
npx vercel --prod --yes

echo "✅ Site en ligne : https://barber-rdv-baptiste.vercel.app"
echo "ℹ️  Si tu as modifié prisma/schema.prisma, lance d'abord : npx prisma db push"
