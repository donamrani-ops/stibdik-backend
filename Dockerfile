# ═══════════════════════════════════════════════════════════
#  STIBDIK BACKEND - DOCKERFILE
#  Production-ready Node.js container
# ═══════════════════════════════════════════════════════════

FROM node:18-alpine AS base

# Install production dependencies
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

# Copy application code
COPY . .

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    chown -R nodejs:nodejs /app

USER nodejs

# Expose port
EXPOSE 5000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node healthcheck.js || exit 1

# Start server
CMD ["node", "server.js"]
