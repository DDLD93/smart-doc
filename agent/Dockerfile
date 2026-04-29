# syntax=docker/dockerfile:1.7
FROM node:22-alpine

WORKDIR /app

RUN apk add --no-cache libc6-compat

COPY package.json package-lock.json* ./
RUN npm ci --include=dev

COPY src ./src

RUN npm run build

ENV NODE_ENV=production

EXPOSE 4111

CMD ["npm", "start"]
