FROM node:18-alpine

WORKDIR /app

# Install pnpm and curl for health checks
RUN npm install -g pnpm && apk add --no-cache curl

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install dependencies
RUN pnpm install

# Copy source code and prisma schema
COPY . .

# Build the application
RUN pnpm build

# Expose port
EXPOSE 3001

# Create startup script that generates Prisma and runs the app
RUN echo '#!/bin/sh\npnpm prisma generate\npnpm prisma db push\npnpm start' > /app/start.sh && chmod +x /app/start.sh

# Start the application
CMD ["/app/start.sh"]
