FROM node:20-alpine

WORKDIR /app

# Install production dependencies first for better layer caching.
COPY package*.json ./
RUN npm ci --omit=dev

# Copy application source.
COPY src ./src
COPY scripts ./scripts

ENV NODE_ENV=production
EXPOSE 5001

# Run as the built-in non-root user.
USER node

CMD ["node", "src/app.js"]
