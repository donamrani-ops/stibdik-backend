// ═══════════════════════════════════════════════════════════
//  SCRIPT: SEED DATABASE
//  Initialiser la DB avec données de démonstration
// ═══════════════════════════════════════════════════════════

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const Product = require('../models/Product');
const Category = require('../models/Category');
const Order = require('../models/Order');

// Connexion MongoDB
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ MongoDB connecté');
  } catch (error) {
    console.error('❌ Erreur MongoDB:', error);
    process.exit(1);
  }
};

// Seed data
const seedData = async () => {
  try {
    // Supprimer données existantes
    await User.deleteMany({});
    await Product.deleteMany({});
    await Category.deleteMany({});
    await Order.deleteMany({});
    console.log('🗑️  Données existantes supprimées');

    // ═══ USERS ═══
    const users = await User.create([
      {
        name: 'Admin Stibdik',
        email: 'admin@stibdik.ma',
        password: 'admin123',
        role: 'admin',
        status: 'active',
        phone: '+212600000001'
      },
      {
        name: 'Sara Bennani',
        email: 'sara@trendshop.ma',
        password: 'vendor123',
        role: 'vendor',
        status: 'active',
        phone: '+212600000002',
        shopName: 'TrendShop',
        shopDescription: 'Mode féminine premium à prix réduits'
      },
      {
        name: 'Karim Alaoui',
        email: 'karim@luxebags.ma',
        password: 'vendor123',
        role: 'vendor',
        status: 'active',
        phone: '+212600000003',
        shopName: 'LuxeBags',
        shopDescription: 'Maroquinerie de luxe d\'occasion'
      },
      {
        name: 'Youssef Tahiri',
        email: 'youssef@techmaroc.ma',
        password: 'vendor123',
        role: 'vendor',
        status: 'active',
        phone: '+212600000004',
        shopName: 'TechMaroc',
        shopDescription: 'Électronique & High-tech reconditionnés'
      },
      {
        name: 'Amina Rachidi',
        email: 'amina@gmail.com',
        password: 'user123',
        role: 'customer',
        status: 'active',
        phone: '+212600000005'
      }
    ]);
    console.log(`✅ ${users.length} utilisateurs créés`);

    // ═══ CATEGORIES ═══
    const categories = await Category.create([
      { name: 'Mode Femme', nameAr: 'أزياء نسائية', icon: '👗', slug: 'mode-femme', order: 1, featured: true },
      { name: 'Mode Homme', nameAr: 'أزياء رجالية', icon: '👔', slug: 'mode-homme', order: 2, featured: true },
      { name: 'Chaussures', nameAr: 'أحذية', icon: '👟', slug: 'chaussures', order: 3, featured: true },
      { name: 'Maison & Déco', nameAr: 'المنزل', icon: '🏠', slug: 'maison', order: 4, featured: true },
      { name: 'Bijoux & Sacs', nameAr: 'مجوهرات', icon: '💎', slug: 'bijoux', order: 5, featured: true },
      { name: 'Électronique', nameAr: 'إلكترونيات', icon: '📱', slug: 'electronique', order: 6, featured: true },
      { name: 'Sport', nameAr: 'رياضة', icon: '⚽', slug: 'sport', order: 7 },
      { name: 'Jouets', nameAr: 'ألعاب', icon: '🎮', slug: 'jouets', order: 8 }
    ]);
    console.log(`✅ ${categories.length} catégories créées`);

    // ═══ PRODUCTS ═══
    const products = await Product.create([
      {
        nameFr: "Robe Florale d'Été",
        nameAr: 'فستان زهري صيفي',
        price: 250,
        original: 650,
        descFr: 'Magnifique robe florale d\'été. Tissu léger. Portée deux fois.',
        category: categories[0]._id,
        vendor: users[1]._id,
        vendorName: users[1].shopName,
        condition: 'Bon état',
        type: 'ecommerce',
        status: 'active',
        city: 'Casablanca',
        stock: 8,
        images: [{ url: 'https://images.unsplash.com/photo-1572804013309-59a88b7e92f1?w=500', isMain: true }],
        badge: 'Sale',
        views: 1234,
        rating: 4.8,
        reviews: 24
      },
      {
        nameFr: 'iPhone 13 Pro 256Go',
        nameAr: 'آيفون 13 برو 256 جيجا',
        price: 4500,
        original: 9000,
        descFr: 'iPhone 13 Pro 256Go. Batterie 91%. Déverrouillé.',
        category: categories[5]._id,
        vendor: users[3]._id,
        vendorName: users[3].shopName,
        condition: 'Très bon état',
        type: 'ecommerce',
        status: 'active',
        city: 'Casablanca',
        stock: 2,
        images: [{ url: 'https://images.unsplash.com/photo-1632661674596-df8be070a5c5?w=500', isMain: true }],
        badge: 'Hot',
        views: 5678,
        rating: 4.8,
        reviews: 67
      },
      {
        nameFr: 'Baskets Nike Air Force',
        nameAr: 'حذاء نايكي أبيض',
        price: 550,
        original: 1100,
        descFr: 'Nike Air Force 1 blanc, taille 42. Portées 3 fois.',
        category: categories[2]._id,
        vendor: users[2]._id,
        vendorName: users[2].shopName,
        condition: 'Comme neuf',
        type: 'ecommerce',
        status: 'active',
        city: 'Casablanca',
        stock: 5,
        images: [{ url: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=500', isMain: true }],
        badge: 'New',
        sizes: ['40', '41', '42', '43'],
        views: 3890,
        rating: 5.0,
        reviews: 56
      },
      {
        nameFr: 'Canapé Gris Moderne',
        nameAr: 'أريكة رمادية عصرية',
        price: 3500,
        original: 8000,
        descFr: 'Élégant canapé sectionnel gris. 2 ans, sans taches.',
        category: categories[3]._id,
        vendor: users[1]._id,
        vendorName: users[1].shopName,
        condition: 'Comme neuf',
        type: 'classifieds',
        status: 'active',
        city: 'Rabat',
        stock: 1,
        images: [{ url: 'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=500', isMain: true }],
        badge: 'Featured',
        views: 879,
        rating: 4.6,
        reviews: 12
      }
    ]);
    console.log(`✅ ${products.length} produits créés`);

    // Mettre à jour productCount des catégories
    await Category.updateAllProductCounts();

    console.log('');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('✅ SEED TERMINÉ');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('');
    console.log('📧 Comptes de test :');
    console.log('');
    console.log('Admin      : admin@stibdik.ma / admin123');
    console.log('Vendor 1   : sara@trendshop.ma / vendor123');
    console.log('Vendor 2   : karim@luxebags.ma / vendor123');
    console.log('Customer   : amina@gmail.com / user123');
    console.log('');
    console.log('═══════════════════════════════════════════════════════════');

    process.exit(0);
  } catch (error) {
    console.error('❌ Erreur seed:', error);
    process.exit(1);
  }
};

// Exécution
connectDB().then(seedData);
