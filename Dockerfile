FROM node:24-alpine

WORKDIR /app

# Install production dependencies first for better layer caching.
COPY package*.json ./
RUN npm ci --omit=dev

# Copy application source.
COPY src ./src
COPY scripts ./scripts

ENV NODE_ENV=production
EXPOSE 5001

HEALTHCHECK --interval=30s --timeout=3s --start-period=15s --retries=3 \
  CMD wget -qO- http://127.0.0.1:5001/ready || exit 1

# Run as the built-in non-root user.
USER node

CMD ["node", "src/app.js"]
