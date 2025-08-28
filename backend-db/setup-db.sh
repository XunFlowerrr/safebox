#!/bin/bash

echo "Setting up SafeBox Backend Database..."

# Navigate to backend directory
cd backend-db

echo "1. Generating Prisma client..."
pnpm run db:generate

echo "2. Pushing schema to database..."
pnpm run db:push

echo "3. Seeding database with mock data..."
pnpm run db:seed

echo "4. Database setup complete!"
echo "You can now start the backend server with: pnpm run dev"
