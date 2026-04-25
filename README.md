# 🚀 STIBDIK BACKEND API

**Marketplace e-commerce marocain** — Backend Node.js + Express + MongoDB

---

## 📋 Table des matières

- [Architecture](#architecture)
- [Installation](#installation)
- [Configuration](#configuration)
- [Lancer le projet](#lancer-le-projet)
- [API Documentation](#api-documentation)
- [Déploiement](#déploiement)
- [Structure du projet](#structure-du-projet)

---

## 🏗️ Architecture

**Stack technique :**
- **Runtime** : Node.js 18+
- **Framework** : Express.js
- **Base de données** : MongoDB (Mongoose ODM)
- **Authentification** : JWT (JSON Web Tokens)
- **Upload fichiers** : Multer + Cloudinary
- **Paiement** : CMI Payment Gateway
- **Sécurité** : Helmet, CORS, Rate Limiting, XSS Protection

**Modèles de données :**
- `User` — Utilisateurs (admin, vendor, customer)
- `Product` — Produits (ecommerce, classifieds, rfq)
- `Order` — Commandes avec tracking
- `Category` — Catégories hiérarchiques

---

## 📦 Installation

### Prérequis

```bash
node -v   # v18.0.0 ou supérieur
npm -v    # v9.0.0 ou supérieur
```

### 1. Cloner le repository

```bash
git clone https://github.com/votre-repo/stibdik-backend.git
cd stibdik-backend
```

### 2. Installer les dépendances

```bash
npm install
```

### 3. Configurer les variables d'environnement

```bash
cp .env.example .env
```

Éditez `.env` et remplissez vos configurations :

```bash
# MongoDB local
MONGODB_URI=mongodb://localhost:27017/stibdik

# JWT secrets (générez des clés sécurisées)
JWT_SECRET=your_super_secret_key_change_in_production
JWT_REFRESH_SECRET=your_refresh_secret_key

# Cloudinary (pour upload images)
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
```

---

## ⚙️ Configuration

### MongoDB

**Option 1 : MongoDB local**

```bash
# Installer MongoDB
brew install mongodb-community  # macOS
# OU
sudo apt install mongodb         # Ubuntu

# Démarrer MongoDB
brew services start mongodb-community  # macOS
sudo systemctl start mongodb           # Ubuntu
```

**Option 2 : MongoDB Atlas (Cloud)**

1. Créez un compte sur [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)
2. Créez un cluster gratuit
3. Obtenez votre connection string
4. Ajoutez-le dans `.env` :

```bash
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/stibdik?retryWrites=true&w=majority
```

### Cloudinary (Upload images)

1. Créez un compte sur [Cloudinary](https://cloudinary.com/)
2. Récupérez vos credentials depuis le Dashboard
3. Ajoutez-les dans `.env`

---

## 🚀 Lancer le projet

### Mode développement (avec auto-reload)

```bash
npm run dev
```

### Mode production

```bash
npm start
```

### Seed la base de données (données de démo)

```bash
npm run seed
```

Le serveur démarre sur **http://localhost:5000**

---

## 📚 API Documentation

### Health Check

```http
GET /health
```

**Réponse :**
```json
{
  "status": "success",
  "message": "Stibdik API is running",
  "mongodb": "connected"
}
```

---

### 🔐 Authentication

#### Register

```http
POST /api/auth/register
Content-Type: application/json

{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "securepass123",
  "role": "customer"
}
```

**Réponse :**
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "64f...",
    "name": "John Doe",
    "email": "john@example.com",
    "role": "customer"
  }
}
```

#### Login

```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "john@example.com",
  "password": "securepass123"
}
```

#### Get Current User

```http
GET /api/auth/me
Authorization: Bearer <token>
```

---

### 📦 Products

#### Get all products

```http
GET /api/products?page=1&limit=20&category=64f...&city=Casablanca
```

**Query params :**
- `page` : Numéro de page (default: 1)
- `limit` : Résultats par page (default: 20, max: 100)
- `category` : Filter par catégorie ID
- `city` : Filter par ville
- `minPrice` / `maxPrice` : Range de prix
- `type` : ecommerce | classifieds | rfq
- `sort` : -createdAt | price | -price | -views

#### Get single product

```http
GET /api/products/:id
```

#### Create product (Vendor only)

```http
POST /api/products
Authorization: Bearer <token>
Content-Type: application/json

{
  "nameFr": "iPhone 13 Pro",
  "nameAr": "آيفون 13 برو",
  "price": 4500,
  "original": 9000,
  "descFr": "iPhone en excellent état...",
  "category": "64f...",
  "condition": "Très bon état",
  "city": "Casablanca",
  "stock": 2,
  "images": ["url1", "url2"]
}
```

#### Update product (Owner/Admin only)

```http
PUT /api/products/:id
Authorization: Bearer <token>
```

#### Delete product (Owner/Admin only)

```http
DELETE /api/products/:id
Authorization: Bearer <token>
```

---

### 🛒 Orders

#### Create order

```http
POST /api/orders
Authorization: Bearer <token>
Content-Type: application/json

{
  "product": "64f...",
  "quantity": 1,
  "shippingAddress": {
    "fullName": "John Doe",
    "phone": "+212600000000",
    "address": "123 Rue Example",
    "city": "Casablanca",
    "postalCode": "20000"
  },
  "paymentMethod": "cod"
}
```

#### Get my orders (Customer)

```http
GET /api/orders/my-orders
Authorization: Bearer <token>
```

#### Get vendor orders (Vendor)

```http
GET /api/orders/vendor-orders
Authorization: Bearer <token>
```

#### Update order status (Vendor/Admin)

```http
PATCH /api/orders/:id/status
Authorization: Bearer <token>
Content-Type: application/json

{
  "status": "shipped",
  "trackingNumber": "TRK123456",
  "carrier": "Amana"
}
```

---

### 🏷️ Categories

#### Get all categories

```http
GET /api/categories
```

#### Get category tree

```http
GET /api/categories/tree
```

---

### 👤 Users

#### Get user profile (Admin)

```http
GET /api/users/:id
Authorization: Bearer <token>
```

#### Update profile

```http
PUT /api/users/profile
Authorization: Bearer <token>
```

---

## 🌐 Déploiement

### Option 1 : Heroku

```bash
# Installer Heroku CLI
brew install heroku/brew/heroku  # macOS

# Login
heroku login

# Créer app
heroku create stibdik-api

# Ajouter MongoDB addon
heroku addons:create mongolab:sandbox

# Configurer variables
heroku config:set JWT_SECRET=your_secret
heroku config:set CLOUDINARY_CLOUD_NAME=your_name
heroku config:set CLOUDINARY_API_KEY=your_key
heroku config:set CLOUDINARY_API_SECRET=your_secret

# Deploy
git push heroku main

# Seed la DB
heroku run npm run seed
```

---

### Option 2 : VPS (DigitalOcean, AWS, etc.)

#### 1. Installer Node.js

```bash
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs
```

#### 2. Installer MongoDB

```bash
wget -qO - https://www.mongodb.org/static/pgp/server-6.0.asc | sudo apt-key add -
echo "deb [ arch=amd64,arm64 ] https://repo.mongodb.org/apt/ubuntu focal/mongodb-org/6.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-6.0.list
sudo apt update
sudo apt install -y mongodb-org
sudo systemctl start mongod
sudo systemctl enable mongod
```

#### 3. Cloner et configurer

```bash
git clone https://github.com/votre-repo/stibdik-backend.git
cd stibdik-backend
npm install --production
cp .env.example .env
# Éditer .env avec vos configs
```

#### 4. Installer PM2 (Process Manager)

```bash
sudo npm install -g pm2
pm2 start server.js --name stibdik-api
pm2 startup
pm2 save
```

#### 5. Nginx reverse proxy

```bash
sudo apt install nginx

# Créer config
sudo nano /etc/nginx/sites-available/stibdik
```

Contenu :
```nginx
server {
    listen 80;
    server_name api.stibdik.ma;

    location / {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/stibdik /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

#### 6. SSL avec Let's Encrypt

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d api.stibdik.ma
```

---

### Option 3 : Docker

**Dockerfile :**

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 5000
CMD ["node", "server.js"]
```

**docker-compose.yml :**

```yaml
version: '3.8'
services:
  api:
    build: .
    ports:
      - "5000:5000"
    environment:
      - MONGODB_URI=mongodb://mongo:27017/stibdik
      - JWT_SECRET=${JWT_SECRET}
    depends_on:
      - mongo
  
  mongo:
    image: mongo:6.0
    volumes:
      - mongo-data:/data/db
    ports:
      - "27017:27017"

volumes:
  mongo-data:
```

**Lancer :**

```bash
docker-compose up -d
```

---

## 📁 Structure du projet

```
stibdik-backend/
├── models/               # Modèles Mongoose
│   ├── User.js
│   ├── Product.js
│   ├── Order.js
│   └── Category.js
├── controllers/          # Logique métier
│   ├── authController.js
│   ├── productController.js
│   ├── orderController.js
│   └── userController.js
├── routes/              # Routes Express
│   ├── auth.js
│   ├── products.js
│   ├── orders.js
│   └── users.js
├── middleware/          # Middlewares
│   ├── auth.js
│   ├── errorHandler.js
│   └── upload.js
├── utils/              # Utilitaires
│   ├── sendEmail.js
│   ├── sendSMS.js
│   └── cloudinary.js
├── scripts/            # Scripts
│   └── seed.js
├── server.js           # Point d'entrée
├── package.json
└── .env.example
```

---

## 🔒 Sécurité

- ✅ Helmet (HTTP headers sécurisés)
- ✅ CORS configuré
- ✅ Rate Limiting (100 req/15min)
- ✅ NoSQL Injection protection
- ✅ XSS protection
- ✅ Passwords hashés avec bcrypt
- ✅ JWT avec expiration
- ✅ Validation des inputs

---

## 📝 License

MIT © Stibdik Team

---

## 🤝 Support

- Email: support@stibdik.ma
- Documentation: https://docs.stibdik.ma
- Issues: https://github.com/votre-repo/stibdik-backend/issues
