# SafeBox - IoT Smart Safe Monitoring System

A full-stack IoT monitoring application for smart safes, featuring real-time sensor data visualization, MQTT messaging, and time-series data storage.

## Architecture

- **Frontend**: Next.js 15 with React and TailwindCSS
- **Backend**: Express.js with TypeScript
- **Message Broker**: Eclipse Mosquitto (MQTT)
- **Database**: InfluxDB (Time-series database)
- **Containerization**: Docker Compose

## Getting Started

### Prerequisites

- Node.js 18+
- pnpm
- Docker and Docker Compose

### Backend Setup

1. Navigate to the backend directory:
   ```bash
   cd backend-db
   ```

2. Run the setup script:
   ```bash
   ./setup-db.sh
   ```

   This will:
   - Start MQTT broker (Mosquitto) and InfluxDB using Docker
   - Install dependencies
   - Seed the database with sample data

3. Start the backend server:
   ```bash
   pnpm dev
   ```

### Frontend Setup

1. In the project root, install dependencies:
   ```bash
   pnpm install
   ```

2. Run the development server:
   ```bash
   pnpm dev
   ```

3. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Services

| Service   | Port  | Description                    |
|-----------|-------|--------------------------------|
| Frontend  | 3000  | Next.js web application        |
| Backend   | 3001  | Express.js API server          |
| MQTT      | 1883  | Mosquitto MQTT broker          |
| MQTT WS   | 9001  | MQTT over WebSocket            |
| InfluxDB  | 8086  | Time-series database UI        |

## MQTT Topics

| Topic                    | Description              |
|--------------------------|--------------------------|
| `safebox/sensor-data`    | Sensor readings          |
| `safebox/safe-status`    | Safe lock/unlock status  |
| `safebox/rotation-data`  | Gyroscope/rotation data  |
| `safebox/command`        | Commands to the device   |

## API Endpoints

| Method | Endpoint                   | Description                  |
|--------|----------------------------|------------------------------|
| GET    | `/api/health`              | Health check status          |
| GET    | `/api/sensor-data`         | Get sensor logs              |
| POST   | `/api/sensor-data`         | Submit sensor data           |
| GET    | `/api/safe-status`         | Get current safe status      |
| POST   | `/api/safe-status`         | Update safe status           |
| GET    | `/api/rotation-data`       | Get rotation logs            |
| GET    | `/api/rotation-data/latest`| Get latest rotation          |
| POST   | `/api/rotation-data`       | Submit rotation data         |
| GET    | `/api/charts`              | Get chart data               |
| GET    | `/api/logs`                | Get event logs               |
| POST   | `/api/command`             | Send command via MQTT        |

## InfluxDB Access

- URL: http://localhost:8086
- Username: `admin`
- Password: `adminpassword`
- Organization: `safebox`
- Bucket: `iot-data`

## Docker Compose

Start all services:
```bash
cd backend-db
docker compose up -d
```

Stop all services:
```bash
docker compose down
```

## Learn More

- [Next.js Documentation](https://nextjs.org/docs)
- [InfluxDB Documentation](https://docs.influxdata.com/influxdb/v2/)
- [MQTT.js Documentation](https://github.com/mqttjs/MQTT.js)
- [Eclipse Mosquitto](https://mosquitto.org/)
