// controllers/analyticsController.js
// Dashboard analytics — métriques de croissance pour piloter le business
const User    = require('../models/User');
const Order   = require('../models/Order');
const Product = require('../models/Product');

// Helper : début de période
function periodStart(period) {
  const now = new Date();
  const start = new Date();
  if (period === '7d')  start.setDate(now.getDate() - 7);
  else if (period === '30d') start.setDate(now.getDate() - 30);
  else if (period === '90d') start.setDate(now.getDate() - 90);
  else if (period === '12m') start.setFullYear(now.getFullYear() - 1);
  else start.setDate(now.getDate() - 30);
  return start;
}

// Helper : générer des buckets temporels (jours ou mois)
function buildBuckets(start, end, granularity) {
  const buckets = [];
  const cur = new Date(start);
  while (cur <= end) {
    buckets.push({
      key: granularity === 'month'
        ? `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}`
        : cur.toISOString().slice(0, 10),
      label: granularity === 'month'
        ? cur.toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' })
        : cur.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }),
      count: 0,
      value: 0,
    });
    if (granularity === 'month') cur.setMonth(cur.getMonth() + 1);
    else cur.setDate(cur.getDate() + 1);
  }
  return buckets;
}

function bucketKey(date, granularity) {
  const d = new Date(date);
  return granularity === 'month'
    ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    : d.toISOString().slice(0, 10);
}

// ── GET /api/analytics/overview ───────────────────────────────────────────────
// Vue d'ensemble : KPIs principaux de croissance
exports.getOverview = async (req, res, next) => {
  try {
    const period = req.query.period || '30d';
    const start = periodStart(period);
    const now = new Date();
    // Période précédente (pour comparaison / croissance)
    const prevStart = new Date(start);
    const span = now.getTime() - start.getTime();
    prevStart.setTime(start.getTime() - span);

    // ── Utilisateurs ──────────────────────────────────────────────────────
    const totalUsers      = await User.countDocuments();
    const newUsers        = await User.countDocuments({ createdAt: { $gte: start } });
    const newUsersPrev    = await User.countDocuments({ createdAt: { $gte: prevStart, $lt: start } });
    const totalVendors    = await User.countDocuments({ role: 'vendor' });

    // ── Commandes & GMV ───────────────────────────────────────────────────
    const orders     = await Order.find({ createdAt: { $gte: start } }).lean();
    const ordersPrev = await Order.find({ createdAt: { $gte: prevStart, $lt: start } }).lean();
    const gmv        = orders.reduce((s, o) => s + (o.totalAmount || 0), 0);
    const gmvPrev    = ordersPrev.reduce((s, o) => s + (o.totalAmount || 0), 0);
    const platformRevenue = gmv * 0.05; // take rate 5%

    // ── Produits ──────────────────────────────────────────────────────────
    const totalProducts  = await Product.countDocuments();
    const newProducts    = await Product.countDocuments({ createdAt: { $gte: start } });
    const activeProducts = await Product.countDocuments({ status: 'active' });

    // ── Acheteurs actifs (ont passé commande sur la période) ──────────────
    const activeBuyers = new Set(orders.map(o => String(o.buyer))).size;

    // ── Panier moyen ──────────────────────────────────────────────────────
    const avgOrderValue = orders.length ? Math.round(gmv / orders.length) : 0;

    // Calcul de croissance %
    const growth = (cur, prev) => prev > 0 ? Math.round(((cur - prev) / prev) * 100) : (cur > 0 ? 100 : 0);

    res.json({
      success: true,
      period,
      kpis: {
        totalUsers,
        newUsers,
        newUsersGrowth: growth(newUsers, newUsersPrev),
        totalVendors,
        totalProducts,
        newProducts,
        activeProducts,
        totalOrders: orders.length,
        ordersGrowth: growth(orders.length, ordersPrev.length),
        gmv,
        gmvGrowth: growth(gmv, gmvPrev),
        platformRevenue: Math.round(platformRevenue),
        activeBuyers,
        avgOrderValue,
      },
    });
  } catch (error) { next(error); }
};

// ── GET /api/analytics/timeseries ─────────────────────────────────────────────
// Courbes temporelles : inscriptions, commandes, GMV
exports.getTimeseries = async (req, res, next) => {
  try {
    const period = req.query.period || '30d';
    const start = periodStart(period);
    const now = new Date();
    const granularity = period === '12m' ? 'month' : 'day';

    // Récupérer les données
    const users  = await User.find({ createdAt: { $gte: start } }).select('createdAt').lean();
    const orders = await Order.find({ createdAt: { $gte: start } }).select('createdAt totalAmount').lean();

    // Construire les buckets
    const userBuckets  = buildBuckets(start, now, granularity);
    const orderBuckets = buildBuckets(start, now, granularity);
    const gmvBuckets   = buildBuckets(start, now, granularity);

    const idx = {};
    userBuckets.forEach((b, i) => { idx[b.key] = i; });

    users.forEach(u => {
      const k = bucketKey(u.createdAt, granularity);
      if (idx[k] !== undefined) userBuckets[idx[k]].count++;
    });
    orders.forEach(o => {
      const k = bucketKey(o.createdAt, granularity);
      if (idx[k] !== undefined) {
        orderBuckets[idx[k]].count++;
        gmvBuckets[idx[k]].value += (o.totalAmount || 0);
      }
    });

    res.json({
      success: true,
      period,
      granularity,
      labels: userBuckets.map(b => b.label),
      signups: userBuckets.map(b => b.count),
      orders:  orderBuckets.map(b => b.count),
      gmv:     gmvBuckets.map(b => Math.round(b.value)),
    });
  } catch (error) { next(error); }
};

// ── GET /api/analytics/top ────────────────────────────────────────────────────
// Top produits, top vendeurs, top catégories
exports.getTop = async (req, res, next) => {
  try {
    const start = periodStart(req.query.period || '30d');
    const orders = await Order.find({ createdAt: { $gte: start } })
      .populate('product', 'nameFr nameAr category')
      .lean();

    // Top produits par nombre de ventes
    const productSales = {};
    const vendorSales = {};
    orders.forEach(o => {
      const pid = String(o.product?._id || o.product);
      const pname = o.product?.nameFr || 'Produit';
      if (!productSales[pid]) productSales[pid] = { name: pname, count: 0, revenue: 0 };
      productSales[pid].count += (o.quantity || 1);
      productSales[pid].revenue += (o.totalAmount || 0);

      const vid = String(o.vendor);
      if (!vendorSales[vid]) vendorSales[vid] = { vendorId: vid, count: 0, revenue: 0 };
      vendorSales[vid].count++;
      vendorSales[vid].revenue += (o.totalAmount || 0);
    });

    const topProducts = Object.values(productSales)
      .sort((a, b) => b.count - a.count).slice(0, 5);

    res.json({ success: true, topProducts });
  } catch (error) { next(error); }
};
