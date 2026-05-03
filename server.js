// ═══════════════════════════════════════════════════════════
//  STIBDIK BACKEND API - SERVER PRINCIPAL
//  Stack: Node.js + Express + MongoDB + JWT
// ═══════════════════════════════════════════════════════════

require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const mongoSanitize = require('express-mongo-sanitize');
const xss = require('xss-clean');
const rateLimit = require('express-rate-limit');

// Import routes
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const productRoutes = require('./routes/products');
const categoryRoutes = require('./routes/categories');
const orderRoutes = require('./routes/orders');
const uploadRoutes = require('./routes/upload');
const paymentRoutes = require('./routes/payment');
const quoteRoutes = require('./routes/quotes');

// Import middleware
const { errorHandler } = require('./middleware/errorHandler');
const { notFound } = require('./middleware/notFound');

// Initialize Express
const app = express();
const PORT = process.env.PORT || 5000;

// ═══════════════════════════════════════════════════════════
//  MIDDLEWARES DE SÉCURITÉ
// ═══════════════════════════════════════════════════════════

// Helmet - Sécurité headers HTTP
app.use(helmet());

// CORS - Autoriser plusieurs origines (frontend principal + previews Netlify + localhost)
//
// Configuration via variable d'environnement FRONTEND_URLS (liste séparée par virgules)
// ou fallback sur FRONTEND_URL (single, pour rétrocompatibilité)
//
// Exemples de valeurs valides pour FRONTEND_URLS:
//   "https://stibdik.ma,https://astounding-rugelach-d6ff69.netlify.app,http://localhost:3000"
//
// Les patterns Netlify de type "*--<site>.netlify.app" sont automatiquement acceptés
// pour le site principal, ce qui permet les deploy previews sans reconfiguration.

const allowedOrigins = (process.env.FRONTEND_URLS || process.env.FRONTEND_URL || 'http://localhost:3000')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

// Extraire les "site_name" Netlify pour autoriser leurs deploy previews
// Ex: si "https://my-site.netlify.app" est listé, on autorise aussi "https://abc123--my-site.netlify.app"
const netlifyPreviewBaseSites = allowedOrigins
  .map(origin => {
    const match = origin.match(/^https?:\/\/(?:[^.]+--)?([a-z0-9-]+)\.netlify\.app$/i);
    return match ? match[1].toLowerCase() : null;
  })
  .filter(Boolean);

const corsOptions = {
  origin(origin, callback) {
    // Pas d'origin (ex: requêtes server-to-server, curl, Postman) → on autorise
    if (!origin) return callback(null, true);

    // Match exact dans la whitelist
    if (allowedOrigins.includes(origin)) return callback(null, true);

    // Match wildcard Netlify previews (xxx--site.netlify.app)
    const previewMatch = origin.match(/^https?:\/\/[a-z0-9-]+--([a-z0-9-]+)\.netlify\.app$/i);
    if (previewMatch && netlifyPreviewBaseSites.includes(previewMatch[1].toLowerCase())) {
      return callback(null, true);
    }

    // Refus
    console.warn(`⚠️  CORS rejected origin: ${origin}`);
    return callback(new Error(`Origin ${origin} not allowed by CORS`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization']
};

console.log(`🔓 CORS allowed origins: ${allowedOrigins.join(', ')}`);
if (netlifyPreviewBaseSites.length) {
  console.log(`🔓 Netlify preview wildcards: ${netlifyPreviewBaseSites.map(s => `*--${s}.netlify.app`).join(', ')}`);
}

app.use(cors(corsOptions));

// Rate limiting - Protection contre force brute
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 min
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  message: 'Trop de requêtes depuis cette IP, réessayez plus tard.',
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', limiter);

// Body parser
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Data sanitization contre NoSQL injection
app.use(mongoSanitize());

// Data sanitization contre XSS
app.use(xss());

// Compression des réponses
app.use(compression());

// Logging en développement
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// ═══════════════════════════════════════════════════════════
//  ROUTES API
// ═══════════════════════════════════════════════════════════

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'success',
    message: 'Stibdik API is running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
  });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/products', productRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/payment', paymentRoutes);
app.use('/api/quotes', quoteRoutes);

// Route non trouvée
app.use(notFound);

// Error handler (doit être en dernier)
app.use(errorHandler);

// ═══════════════════════════════════════════════════════════
//  CONNEXION MONGODB & DÉMARRAGE SERVEUR
// ═══════════════════════════════════════════════════════════

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log(`✅ MongoDB connecté: ${conn.connection.host}`);
    console.log(`📊 Base de données: ${conn.connection.name}`);

    // Démarrer le serveur après connexion DB
    app.listen(PORT, () => {
      console.log('');
      console.log('═══════════════════════════════════════════════════════════');
      console.log(`🚀 Stibdik API Server - ${process.env.NODE_ENV?.toUpperCase() || 'DEV'}`);
      console.log('═══════════════════════════════════════════════════════════');
      console.log(`📡 Server: http://localhost:${PORT}`);
      console.log(`🌐 Health: http://localhost:${PORT}/health`);
      console.log(`📚 API Docs: http://localhost:${PORT}/api/docs`);
      console.log('═══════════════════════════════════════════════════════════');
      console.log('');
    });

  } catch (error) {
    console.error('❌ Erreur de connexion MongoDB:', error.message);
    process.exit(1);
  }
};

// Gestion des erreurs non gérées
process.on('unhandledRejection', (err) => {
  console.error('❌ UNHANDLED REJECTION! Arrêt du serveur...');
  console.error(err.name, err.message);
  process.exit(1);
});

process.on('SIGTERM', () => {
  console.log('👋 SIGTERM reçu. Arrêt gracieux du serveur...');
  mongoose.connection.close(() => {
    console.log('💤 Connexion MongoDB fermée.');
    process.exit(0);
  });
});

// Lancement
connectDB();

module.exports = app;
