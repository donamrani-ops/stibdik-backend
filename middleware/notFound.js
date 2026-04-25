// ═══════════════════════════════════════════════════════════
//  MIDDLEWARE: NOT FOUND
//  Route non trouvée (404)
// ═══════════════════════════════════════════════════════════

exports.notFound = (req, res, next) => {
  res.status(404).json({
    success: false,
    message: `Route non trouvée - ${req.originalUrl}`,
    method: req.method
  });
};
