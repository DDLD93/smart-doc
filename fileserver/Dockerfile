# syntax=docker/dockerfile:1.7
FROM node:22-alpine

WORKDIR /app

ENV NODE_ENV=production

RUN apk add --no-cache openssl libc6-compat

COPY package.json package-lock.json* ./
RUN npm ci --include=dev

COPY prisma ./prisma
RUN npx prisma generate

COPY src ./src

EXPOSE 3000

CMD ["sh", "-c", "node src/server.js"]
