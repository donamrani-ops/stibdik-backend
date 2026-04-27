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

// CORS - Autoriser le frontend
app.use(cors({
  origin: '*', // Permet toutes les origines
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));


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
