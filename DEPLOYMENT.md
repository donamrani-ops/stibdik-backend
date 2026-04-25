# 📦 STIBDIK - GUIDE COMPLET DE DÉPLOIEMENT

Ce guide vous accompagne du développement local jusqu'à la production.

---

## 📋 CHECKLIST PRÉ-DÉPLOIEMENT

- [ ] MongoDB configuré (local ou Atlas)
- [ ] Variables d'environnement remplies
- [ ] Cloudinary configuré pour uploads
- [ ] CMI credentials obtenus
- [ ] Domaine configuré (optionnel)
- [ ] SSL certificates (production)

---

## 🖥️ DÉVELOPPEMENT LOCAL

### 1. Installation

```bash
npm install
cp .env.example .env
# Éditer .env
```

### 2. MongoDB local

```bash
# macOS
brew services start mongodb-community

# Ubuntu
sudo systemctl start mongod

# Windows
net start MongoDB
```

### 3. Seed + Start

```bash
npm run seed
npm run dev
```

✅ API disponible sur **http://localhost:5000**

---

## ☁️ DÉPLOIEMENT PRODUCTION

### Option A : Heroku (le plus simple)

```bash
# 1. Installer Heroku CLI
curl https://cli-assets.heroku.com/install.sh | sh

# 2. Login
heroku login

# 3. Créer app
heroku create stibdik-api

# 4. Ajouter MongoDB
heroku addons:create mongolab:sandbox

# 5. Config vars
heroku config:set JWT_SECRET=$(openssl rand -base64 32)
heroku config:set CLOUDINARY_CLOUD_NAME=your_name
heroku config:set CLOUDINARY_API_KEY=your_key
heroku config:set CLOUDINARY_API_SECRET=your_secret

# 6. Deploy
git push heroku main

# 7. Seed
heroku run npm run seed

# 8. Ouvrir
heroku open
```

**URL finale** : https://stibdik-api.herokuapp.com

---

### Option B : DigitalOcean / AWS / VPS

#### 1. Créer un Droplet (exemple DigitalOcean)

- Ubuntu 22.04 LTS
- 2 GB RAM minimum
- SSH configuré

#### 2. Se connecter au serveur

```bash
ssh root@YOUR_SERVER_IP
```

#### 3. Installer Node.js

```bash
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs
node -v  # Vérifier v18+
```

#### 4. Installer MongoDB

```bash
wget -qO - https://www.mongodb.org/static/pgp/server-6.0.asc | sudo apt-key add -
echo "deb [ arch=amd64,arm64 ] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/6.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-6.0.list
sudo apt update
sudo apt install -y mongodb-org
sudo systemctl start mongod
sudo systemctl enable mongod
```

#### 5. Cloner le repo

```bash
git clone https://github.com/votre-repo/stibdik-backend.git
cd stibdik-backend
npm install --production
```

#### 6. Configurer .env

```bash
nano .env
```

Copier-coller vos configs :
```bash
NODE_ENV=production
PORT=5000
MONGODB_URI=mongodb://localhost:27017/stibdik
JWT_SECRET=VOTRE_SECRET_SECURISE
# ... autres configs
```

#### 7. Installer PM2 (Process Manager)

```bash
sudo npm install -g pm2
pm2 start server.js --name stibdik-api
pm2 startup
pm2 save
```

#### 8. Installer Nginx

```bash
sudo apt install -y nginx
```

Créer config Nginx :

```bash
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
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Activer :

```bash
sudo ln -s /etc/nginx/sites-available/stibdik /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

#### 9. SSL avec Let's Encrypt

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d api.stibdik.ma
```

✅ API disponible sur **https://api.stibdik.ma**

---

### Option C : Docker (recommandé pour scaling)

#### 1. Installer Docker

```bash
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER
```

#### 2. Créer .env

```bash
cp .env.example .env
# Éditer avec vos configs
```

#### 3. Build & Run

```bash
docker-compose up -d
```

#### 4. Vérifier

```bash
docker-compose logs -f api
docker-compose ps
```

#### 5. Seed la DB

```bash
docker-compose exec api npm run seed
```

✅ API disponible sur **http://localhost:5000**

---

## 🔐 SÉCURITÉ PRODUCTION

### Checklist

- [ ] JWT_SECRET changé (>32 caractères aléatoires)
- [ ] HTTPS activé (Let's Encrypt)
- [ ] Rate limiting activé
- [ ] MongoDB authentication configurée
- [ ] Firewall configuré (UFW)
- [ ] Logs configurés
- [ ] Backups MongoDB automatiques

### Générer JWT secret sécurisé

```bash
openssl rand -base64 32
```

### Configurer MongoDB auth

```bash
mongosh
use admin
db.createUser({
  user: "stibdikAdmin",
  pwd: "STRONG_PASSWORD",
  roles: ["readWriteAnyDatabase"]
})
```

Mettre à jour .env :

```bash
MONGODB_URI=mongodb://stibdikAdmin:STRONG_PASSWORD@localhost:27017/stibdik
```

### Firewall (UFW)

```bash
sudo ufw allow 22    # SSH
sudo ufw allow 80    # HTTP
sudo ufw allow 443   # HTTPS
sudo ufw enable
```

---

## 📊 MONITORING

### PM2 Monitoring

```bash
pm2 monit
pm2 status
pm2 logs stibdik-api
```

### Logs

```bash
# Derniers logs
pm2 logs --lines 100

# Logs temps réel
pm2 logs stibdik-api --lines 0
```

---

## 🔄 MISE À JOUR

```bash
# Pull nouveau code
git pull origin main

# Installer dépendances
npm install --production

# Redémarrer
pm2 restart stibdik-api
```

---

## 💾 BACKUPS

### MongoDB backup automatique

Créer script :

```bash
nano ~/backup-mongo.sh
```

Contenu :

```bash
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
mongodump --out /backups/mongodb-$DATE
find /backups -mtime +7 -delete
```

Rendre exécutable :

```bash
chmod +x ~/backup-mongo.sh
```

Cron job (tous les jours à 3h) :

```bash
crontab -e
```

Ajouter :

```
0 3 * * * /root/backup-mongo.sh
```

---

## 🆘 TROUBLESHOOTING

### API ne démarre pas

```bash
# Vérifier logs
pm2 logs stibdik-api

# Vérifier MongoDB
sudo systemctl status mongod

# Vérifier port
sudo lsof -i :5000
```

### Erreur MongoDB connection

```bash
# Redémarrer MongoDB
sudo systemctl restart mongod

# Vérifier status
sudo systemctl status mongod
```

### 502 Bad Gateway (Nginx)

```bash
# Vérifier API
pm2 status

# Redémarrer Nginx
sudo systemctl restart nginx

# Logs Nginx
sudo tail -f /var/log/nginx/error.log
```

---

## 📞 SUPPORT

- Documentation : README.md
- Issues : GitHub Issues
- Email : support@stibdik.ma

---

✅ **Votre backend Stibdik est prêt pour la production !**
