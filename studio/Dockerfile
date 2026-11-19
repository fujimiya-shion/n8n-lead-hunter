# Image chính thức của Playwright: có sẵn Chromium + thư viện hệ thống (khớp version với package.json)
FROM mcr.microsoft.com/playwright:v1.49.1-noble

WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY src ./src
COPY public ./public
COPY skills ./skills

ENV NODE_ENV=production \
    PORT=8082 \
    DATA_DIR=/data
EXPOSE 8082
CMD ["node", "src/server.js"]
