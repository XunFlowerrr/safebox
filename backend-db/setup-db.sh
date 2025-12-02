#!/bin/bash

echo "Setting up SafeBox Backend with MQTT and InfluxDB..."

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed. Please install Docker first."
    exit 1
fi

# Create mosquitto directories
echo "1. Creating Mosquitto directories..."
mkdir -p mosquitto/config mosquitto/data mosquitto/log

# Start Docker services (MQTT and InfluxDB)
echo "2. Starting Docker services (MQTT broker and InfluxDB)..."
docker compose up -d mqtt influxdb

# Wait for InfluxDB to be ready
echo "3. Waiting for InfluxDB to be ready..."
sleep 10

# Create .env file if it doesn't exist
if [ ! -f .env ]; then
    echo "4. Creating .env file..."
    cp .env.example .env
fi

# Install dependencies
echo "5. Installing dependencies..."
pnpm install

# Seed the database
echo "6. Seeding InfluxDB..."
pnpm run db:seed

echo "✅ Database setup complete!"
echo ""
echo "🚀 To start the backend server, run: pnpm dev"
echo "📡 MQTT Broker is available at: mqtt://localhost:1883"
echo "📊 InfluxDB UI is available at: http://localhost:8086"
echo "   - Username: admin"
echo "   - Password: adminpassword"
