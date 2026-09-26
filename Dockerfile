FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
COPY src/shared/package.json src/shared/
COPY src/server/package.json src/server/
COPY src/web/package.json src/web/
RUN npm install --ignore-scripts

FROM deps AS build
WORKDIR /app
COPY tsconfig.base.json ./
COPY src/shared src/shared
COPY src/server src/server
COPY src/web src/web
COPY fixtures.json ./fixtures.json
RUN npm run build -w @dogfood/shared \
  && npm run build -w @dogfood/server \
  && npm run build -w @dogfood/web

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV CHECKPOINT_DISABLE=1
COPY package.json package-lock.json* ./
COPY src/shared/package.json src/shared/
COPY src/server/package.json src/server/
COPY src/web/package.json src/web/
COPY src/server/prisma src/server/prisma
RUN npm install --omit=dev --ignore-scripts \
  && cd src/server && npx --no-install prisma generate
COPY --from=build /app/src/shared/dist src/shared/dist
COPY --from=build /app/src/server/dist src/server/dist
COPY --from=build /app/src/web/dist src/web/dist
COPY fixtures.json /app/fixtures.json
WORKDIR /app/src/server
EXPOSE 8080
CMD ["sh", "-c", "npx --no-install prisma migrate deploy && node dist/seed/index.js && node dist/index.js"]
