# Use Node.js 20 (Latest LTS)
FROM --platform=linux/amd64 node:20-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files and prisma schema
COPY package*.json ./
COPY prisma ./prisma/

# Install dependencies and generate Prisma client
RUN npm ci
RUN npx prisma generate

# Copy the rest of the application
COPY . .

# Set build-time environment variables
ARG DATABASE_URL
ARG DATABASE_URL_NON_POOLING
ARG GCS_PROJECT_ID
ARG GCS_BUCKET_NAME
ARG GCS_CLIENT_EMAIL
ARG GCS_PRIVATE_KEY
ARG SEOBOT_API_KEY
ARG NEXT_PUBLIC_API_URL

ENV DATABASE_URL=$DATABASE_URL
ENV DATABASE_URL_NON_POOLING=$DATABASE_URL_NON_POOLING
ENV GCS_PROJECT_ID=$GCS_PROJECT_ID
ENV GCS_BUCKET_NAME=$GCS_BUCKET_NAME
ENV GCS_CLIENT_EMAIL=$GCS_CLIENT_EMAIL
ENV GCS_PRIVATE_KEY=$GCS_PRIVATE_KEY
ENV SEOBOT_API_KEY=$SEOBOT_API_KEY
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NODE_ENV=production

# Build the Next.js application
RUN npm run build

# Production image
FROM --platform=linux/amd64 node:20-alpine

WORKDIR /app

# Copy necessary files from builder
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma

# Expose the port
EXPOSE 8080

# Set environment variables
ENV PORT=8080
ENV NODE_ENV=production

# Start the server
CMD ["npm", "start"] 