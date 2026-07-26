FROM node:22-alpine

WORKDIR /app

# Install production deps first for better layer caching
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src
COPY public ./public
COPY data ./data

ENV NODE_ENV=production
ENV PORT=3847

EXPOSE 3847

# Persist settings / last-report baseline across restarts
VOLUME ["/app/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3847)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "src/index.js"]
