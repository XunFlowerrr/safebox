Write-Host "Setting up SafeBox Backend with MQTT and InfluxDB..." -ForegroundColor Green

# Check if Docker is installed
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Host "Docker is not installed. Please install Docker first." -ForegroundColor Red
    exit 1
}

Write-Host "1. Creating Mosquitto directories..." -ForegroundColor Yellow
New-Item -ItemType Directory -Force -Path mosquitto/config, mosquitto/data, mosquitto/log | Out-Null

Write-Host "2. Starting Docker services (MQTT broker and InfluxDB)..." -ForegroundColor Yellow
docker compose up -d mqtt influxdb

Write-Host "3. Waiting for InfluxDB to be ready..." -ForegroundColor Yellow
Start-Sleep -Seconds 10

# Create .env file if it doesn't exist
if (-not (Test-Path .env)) {
    Write-Host "4. Creating .env file..." -ForegroundColor Yellow
    Copy-Item .env.example .env
}

Write-Host "5. Installing dependencies..." -ForegroundColor Yellow
pnpm install

Write-Host "6. Seeding InfluxDB..." -ForegroundColor Yellow
pnpm run db:seed

Write-Host "Database setup complete!" -ForegroundColor Green
Write-Host ""
Write-Host "To start the backend server, run: pnpm dev" -ForegroundColor Cyan
Write-Host "MQTT Broker is available at: mqtt://localhost:1883" -ForegroundColor Cyan
Write-Host "InfluxDB UI is available at: http://localhost:8086" -ForegroundColor Cyan
Write-Host "   - Username: admin" -ForegroundColor Cyan
Write-Host "   - Password: adminpassword" -ForegroundColor Cyan
