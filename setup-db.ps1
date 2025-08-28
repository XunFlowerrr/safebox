Write-Host "Setting up SafeBox Backend Database..." -ForegroundColor Green

# Navigate to backend directory
Set-Location backend-db

Write-Host "1. Generating Prisma client..." -ForegroundColor Yellow
npm run db:generate

Write-Host "2. Pushing schema to database..." -ForegroundColor Yellow
npm run db:push

Write-Host "3. Seeding database with mock data..." -ForegroundColor Yellow
npm run db:seed

Write-Host "4. Database setup complete!" -ForegroundColor Green
Write-Host "You can now start the backend server with: npm run dev" -ForegroundColor Cyan
