import { InfluxDB, Point, WriteApi } from "@influxdata/influxdb-client";

// InfluxDB Configuration
const INFLUXDB_URL = process.env.INFLUXDB_URL || "http://localhost:8086";
const INFLUXDB_TOKEN = process.env.INFLUXDB_TOKEN || "safebox-influxdb-token";
const INFLUXDB_ORG = process.env.INFLUXDB_ORG || "safebox";
const INFLUXDB_BUCKET = process.env.INFLUXDB_BUCKET || "iot-data";

// Initialize InfluxDB client
const influxDB = new InfluxDB({ url: INFLUXDB_URL, token: INFLUXDB_TOKEN });
const writeApi: WriteApi = influxDB.getWriteApi(INFLUXDB_ORG, INFLUXDB_BUCKET, "ns");

async function seed() {
  console.log("Seeding InfluxDB with mock data...");

  const safeId = "safe-001";
  const now = new Date();

  // Generate sensor data for the last 24 hours
  for (let i = 0; i < 24; i++) {
    const timestamp = new Date(now.getTime() - (23 - i) * 60 * 60 * 1000);

    // Generate tilt data
    const base = 10 + Math.abs(Math.sin(i / 3)) * 15;
    const spike = i % 7 === 0 ? 12 : 0;
    const tiltValue = Math.min(45, Number((base + spike).toFixed(1)));

    const tiltPoint = new Point("sensor_data")
      .tag("safeId", safeId)
      .tag("sensorType", "tilt")
      .tag("unit", "degrees")
      .floatField("value", tiltValue)
      .timestamp(timestamp);
    writeApi.writePoint(tiltPoint);

    // Generate vibration data
    const vibration = Math.max(
      0,
      Math.round(2 + Math.cos(i / 2) * 1.5 + (i % 5 === 0 ? 3 : 0))
    );

    const vibrationPoint = new Point("sensor_data")
      .tag("safeId", safeId)
      .tag("sensorType", "vibration")
      .tag("unit", "level")
      .floatField("value", vibration)
      .timestamp(timestamp);
    writeApi.writePoint(vibrationPoint);
  }

  // Generate safe status events
  const statusEvents = [
    { status: "unlock", hoursAgo: 22 },
    { status: "lock", hoursAgo: 18 },
    { status: "open", hoursAgo: 12 },
    { status: "lock", hoursAgo: 6 },
  ];

  for (const event of statusEvents) {
    const timestamp = new Date(now.getTime() - event.hoursAgo * 60 * 60 * 1000);
    const statusPoint = new Point("safe_status")
      .tag("safeId", safeId)
      .stringField("status", event.status)
      .timestamp(timestamp);
    writeApi.writePoint(statusPoint);
  }

  // Generate event logs
  const eventLogs = [
    { type: "Hit", content: "Impact detected on front panel.", severity: "warning", hoursAgo: 26 },
    { type: "Tilt", content: "Box tilted beyond 30° on Y-axis.", severity: "warning", hoursAgo: 24 },
    { type: "Open with alarm", content: "Lid opened while armed. Siren triggered.", severity: "error", hoursAgo: 22 },
    { type: "Open", content: "Lid opened while disarmed.", severity: "info", hoursAgo: 20 },
    { type: "Vibration", content: "High vibration level detected (8.2).", severity: "warning", hoursAgo: 18 },
    { type: "Hit", content: "Strong impact detected on right side.", severity: "warning", hoursAgo: 14 },
    { type: "Tilt", content: "Box tilted back to safe range.", severity: "info", hoursAgo: 12 },
    { type: "Arm", content: "System armed by user.", severity: "info", hoursAgo: 8 },
    { type: "Disarm", content: "System disarmed by user.", severity: "info", hoursAgo: 6 },
    { type: "Open with alarm", content: "Unauthorized access attempt detected.", severity: "error", hoursAgo: 4 },
    { type: "Network", content: "Device reconnected to Wi‑Fi.", severity: "info", hoursAgo: 2 },
  ];

  for (const log of eventLogs) {
    const timestamp = new Date(now.getTime() - log.hoursAgo * 60 * 60 * 1000);
    const eventPoint = new Point("event_log")
      .tag("safeId", safeId)
      .tag("type", log.type)
      .tag("severity", log.severity)
      .stringField("content", log.content)
      .timestamp(timestamp);
    writeApi.writePoint(eventPoint);
  }

  // Generate rotation data
  for (let i = 0; i < 10; i++) {
    const timestamp = new Date(now.getTime() - (10 - i) * 60 * 1000);
    const rotationPoint = new Point("rotation_data")
      .tag("safeId", safeId)
      .floatField("alpha", Math.random() * 360)
      .floatField("beta", Math.random() * 180 - 90)
      .floatField("gamma", Math.random() * 180 - 90)
      .timestamp(timestamp);
    writeApi.writePoint(rotationPoint);
  }

  // Flush all data
  await writeApi.flush();
  await writeApi.close();

  console.log("Database seeded successfully!");
  console.log(`- 48+ sensor data points created`);
  console.log(`- ${statusEvents.length} status events created`);
  console.log(`- ${eventLogs.length} event logs created`);
  console.log(`- 10 rotation data points created`);
}

seed()
  .then(() => {
    console.log("Seed completed");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exit(1);
  });
