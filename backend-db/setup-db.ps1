Write-Host "Setting up SafeBox Backend Database..." -ForegroundColor Green

Write-Host "1. Generating Prisma client..." -ForegroundColor Yellow
pnpm run db:generate

Write-Host "2. Pushing schema to database..." -ForegroundColor Yellow
pnpm run db:push

Write-Host "3. Seeding database with mock data..." -ForegroundColor Yellow
pnpm run db:seed

Write-Host "4. Database setup complete!" -ForegroundColor Green
Write-Host "You can now start the backend server with: pnpm run dev" -ForegroundColor Cyan
