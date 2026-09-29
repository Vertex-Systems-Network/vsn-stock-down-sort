FROM node:22.18-alpine
RUN apk add --no-cache openssl

EXPOSE 3000

WORKDIR /app

ENV NODE_ENV=production

COPY package.json package-lock.json* ./

# Prisma CLI is required at runtime to select/apply the environment-specific
# schema before the server starts.
RUN npm ci && npm cache clean --force

COPY . .

RUN npx prisma generate --schema prisma/cloud/schema.prisma && npm run build

CMD ["npm", "run", "docker-start"]
