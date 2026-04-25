# 🚀 QUICK START - 5 MINUTES

## Installation rapide

```bash
# 1. Cloner
git clone <repo-url>
cd stibdik-backend

# 2. Installer
npm install

# 3. Configurer
cp .env.example .env
# Éditer .env avec vos configs MongoDB

# 4. Seed la DB
npm run seed

# 5. Lancer
npm run dev
```

## ✅ Test rapide

```bash
# Health check
curl http://localhost:5000/health

# Register
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Test User","email":"test@test.com","password":"test123","role":"customer"}'

# Login
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"test123"}'
```

## 📦 MongoDB Atlas (gratuit)

1. https://www.mongodb.com/cloud/atlas/register
2. Créer cluster gratuit
3. Get connection string
4. Ajouter dans .env

## 🐳 Docker (alternative)

```bash
docker-compose up -d
```

---

Vous êtes prêt ! 🎉

Documentation complète : README.md
