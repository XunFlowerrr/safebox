FROM node:18-slim

WORKDIR /app

# Install pnpm and curl for health checks
RUN npm install -g pnpm && apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install dependencies
RUN pnpm install

# Copy source code and prisma schema
COPY . .

RUN pnpm prisma generate
# Build the application
RUN pnpm build

# Expose port
EXPOSE 3001

# Create startup script that generates Prisma and runs the app
RUN printf '#!/bin/sh\npnpm prisma generate\npnpm prisma db push\npnpm start\n' > /app/start.sh && chmod +x /app/start.sh

# Start the application
CMD ["sh", "/app/start.sh"]
