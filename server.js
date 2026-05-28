// ═══════════════════════════════════════════════════════════
//  STIBDIK BACKEND API - SERVER PRINCIPAL
// ═══════════════════════════════════════════════════════════

require('dotenv').config();
const express        = require('express');
const mongoose       = require('mongoose');
const cors           = require('cors');
const helmet         = require('helmet');
const morgan         = require('morgan');
const compression    = require('compression');
const mongoSanitize  = require('express-mongo-sanitize');
const xss            = require('xss-clean');
const rateLimit      = require('express-rate-limit');

// ── Routes ───────────────────────────────────────────────
const authRoutes        = require('./routes/auth');
const userRoutes        = require('./routes/users');
const productRoutes     = require('./routes/products');
const categoryRoutes    = require('./routes/categories');
const orderRoutes       = require('./routes/orders');
const uploadRoutes      = require('./routes/upload');
const paymentRoutes     = require('./routes/payment');
const quoteRoutes       = require('./routes/quotes');
const boostRoutes       = require('./routes/boosts');
const wishlistRoutes    = require('./routes/wishlist');
const reviewRoutes      = require('./routes/reviews');
const couponRoutes      = require('./routes/coupons');
const collectionsRoutes = require('./routes/collections');
const auditRoutes       = require('./routes/audit');
const ticketRoutes      = require('./routes/tickets');

// ── Middleware ───────────────────────────────────────────
const { errorHandler } = require('./middleware/errorHandler');
const { notFound }     = require('./middleware/notFound');

// ── App ──────────────────────────────────────────────────
const app  = express();
const PORT = process.env.PORT || 5000;

// Trust proxy Render/Heroku
app.set('trust proxy', 1);

// ── Sécurité ─────────────────────────────────────────────
app.use(helmet());

const allowedOrigins = (process.env.FRONTEND_URLS || process.env.FRONTEND_URL || 'http://localhost:3000')
  .split(',').map(s => s.trim()).filter(Boolean);

const netlifyPreviewBaseSites = allowedOrigins
  .map(origin => {
    const match = origin.match(/^https?:\/\/(?:[^.]+--)?([a-z0-9-]+)\.netlify\.app$/i);
    return match ? match[1].toLowerCase() : null;
  }).filter(Boolean);

const corsOptions = {
  origin(origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    const previewMatch = origin.match(/^https?:\/\/[a-z0-9-]+--([a-z0-9-]+)\.netlify\.app$/i);
    if (previewMatch && netlifyPreviewBaseSites.includes(previewMatch[1].toLowerCase())) {
      return callback(null, true);
    }
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

const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max:      parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  message: 'Trop de requêtes depuis cette IP, réessayez plus tard.',
  standardHeaders: true,
  legacyHeaders:   false,
});
app.use('/api/', limiter);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(mongoSanitize());
app.use(xss());
app.use(compression());

if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// ── Health check ─────────────────────────────────────────
app.get('/health', (req, res) => {
  res.status(200).json({
    status:      'success',
    message:     'Stibdik API is running',
    timestamp:   new Date().toISOString(),
    environment: process.env.NODE_ENV,
    mongodb:     mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
  });
});

// ── Routes API ───────────────────────────────────────────
app.use('/api/auth',        authRoutes);
app.use('/api/users',       userRoutes);
app.use('/api/products',    productRoutes);
app.use('/api/categories',  categoryRoutes);
app.use('/api/orders',      orderRoutes);
app.use('/api/upload',      uploadRoutes);
app.use('/api/payment',     paymentRoutes);
app.use('/api/quotes',      quoteRoutes);
app.use('/api/boosts',      boostRoutes);
app.use('/api/wishlist',    wishlistRoutes);
app.use('/api/reviews',     reviewRoutes);
app.use('/api/coupons',     couponRoutes);
app.use('/api/collections', collectionsRoutes);
app.use('/api/audit',       auditRoutes);
app.use('/api/tickets',           ticketRoutes);
app.use('/api/offers',            require('./routes/offers'));
// Stock notifications — chargement conditionnel (fichier optionnel)
try { app.use('/api/stock-notifications', require('./routes/stock-notification')); } catch(e) { console.warn('⚠️ stock-notifications non chargé:', e.message); }

// 404 + Error handler — TOUJOURS en dernier
app.use(notFound);
app.use(errorHandler);

// ── MongoDB + Start ──────────────────────────────────────
const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser:    true,
      useUnifiedTopology: true,
    });
    console.log(`✅ MongoDB connecté: ${conn.connection.host}`);
    console.log(`📊 Base de données: ${conn.connection.name}`);
    app.listen(PORT, () => {
      console.log('');
      console.log('═══════════════════════════════════════════════════════════');
      console.log(`🚀 Stibdik API Server - ${process.env.NODE_ENV?.toUpperCase() || 'DEV'}`);
      console.log('═══════════════════════════════════════════════════════════');
      console.log(`📡 Server: http://localhost:${PORT}`);
      console.log(`🌐 Health: http://localhost:${PORT}/health`);
      console.log('═══════════════════════════════════════════════════════════');
    });
  } catch (error) {
    console.error('❌ Erreur de connexion MongoDB:', error.message);
    process.exit(1);
  }
};

process.on('unhandledRejection', (err) => {
  console.error('❌ UNHANDLED REJECTION!', err.name, err.message);
  process.exit(1);
});

process.on('SIGTERM', () => {
  console.log('👋 SIGTERM reçu. Arrêt gracieux...');
  mongoose.connection.close(() => process.exit(0));
});

connectDB();
module.exports = app;
