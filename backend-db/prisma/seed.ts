import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding database with mock data...");

  // Clear existing data
  await prisma.eventLog.deleteMany();
  await prisma.chartData.deleteMany();
  await prisma.sensorLog.deleteMany();
  await prisma.safeStatus.deleteMany();

  const safeId = "safe-001";
  const now = new Date();

  // Generate sensor data for the last 24 hours
  const sensorLogs = [];
  for (let i = 0; i < 24; i++) {
    const timestamp = new Date(now.getTime() - (23 - i) * 60 * 60 * 1000);

    // Generate tilt data (accelerometer)
    const base = 10 + Math.abs(Math.sin(i / 3)) * 15;
    const spike = i % 7 === 0 ? 12 : 0;
    const tiltAngle = Math.min(45, Number((base + spike).toFixed(1)));
    const accelerometerValue = tiltAngle / 10; // Convert to accelerometer reading

    // Generate vibration data
    const vibration = Math.max(
      0,
      Math.round(2 + Math.cos(i / 2) * 1.5 + (i % 5 === 0 ? 3 : 0))
    );

    sensorLogs.push(
      {
        sensorType: "accelerometer",
        value: accelerometerValue,
        unit: "g",
        timestamp,
        safeId,
      },
      {
        sensorType: "vibration",
        value: vibration,
        unit: "level",
        timestamp,
        safeId,
      }
    );

    // Add some random events
    if (i % 8 === 0) {
      sensorLogs.push({
        sensorType: "magnetic_hall",
        value: Math.random() > 0.7 ? 0.3 : 1.0, // Door open/closed
        unit: "bool",
        timestamp,
        safeId,
      });
    }

    if (i % 12 === 0) {
      sensorLogs.push({
        sensorType: "buzzer",
        value: Math.random() * 10,
        unit: "dB",
        timestamp,
        safeId,
      });
    }

    // Add temperature and battery data
    if (i % 6 === 0) {
      sensorLogs.push({
        sensorType: "temperature",
        value: 20 + Math.random() * 15,
        unit: "°C",
        timestamp,
        safeId,
      });
    }

    if (i % 24 === 0) {
      sensorLogs.push({
        sensorType: "battery",
        value: 85 - Math.random() * 70,
        unit: "%",
        timestamp,
        safeId,
      });
    }
  }

  // Insert sensor data
  await prisma.sensorLog.createMany({
    data: sensorLogs,
  });

  // Generate chart data aggregations
  const chartData = [];
  for (let i = 0; i < 24; i++) {
    const base = 10 + Math.abs(Math.sin(i / 3)) * 15;
    const spike = i % 7 === 0 ? 12 : 0;
    const tilt = Math.min(45, Number((base + spike).toFixed(1)));
    const vib = Math.max(
      0,
      Math.round(2 + Math.cos(i / 2) * 1.5 + (i % 5 === 0 ? 3 : 0))
    );

    chartData.push({
      hour: i,
      date: now.toISOString().split("T")[0],
      tilt,
      vibration: vib,
      safeId,
    });
  }

  await prisma.chartData.createMany({
    data: chartData,
  });

  // Generate safe status events
  const statusEvents = [
    {
      status: "unlock",
      timestamp: new Date(now.getTime() - 22 * 60 * 60 * 1000),
    },
    {
      status: "lock",
      timestamp: new Date(now.getTime() - 18 * 60 * 60 * 1000),
    },
    {
      status: "open",
      timestamp: new Date(now.getTime() - 12 * 60 * 60 * 1000),
    },
    { status: "lock", timestamp: new Date(now.getTime() - 6 * 60 * 60 * 1000) },
  ];

  for (const event of statusEvents) {
    await prisma.safeStatus.create({
      data: {
        ...event,
        safeId,
      },
    });
  }

  // Generate event logs
  const eventLogs = [
    {
      type: "Hit",
      content: "Impact detected on front panel.",
      severity: "warning",
    },
    {
      type: "Tilt",
      content: "Box tilted beyond 30° on Y-axis.",
      severity: "warning",
    },
    {
      type: "Open with alarm",
      content: "Lid opened while armed. Siren triggered.",
      severity: "error",
    },
    { type: "Open", content: "Lid opened while disarmed.", severity: "info" },
    {
      type: "Vibration",
      content: "High vibration level detected (8.2).",
      severity: "warning",
    },
    {
      type: "Temperature",
      content: "Temperature rose to 35.4°C.",
      severity: "warning",
    },
    {
      type: "Hit",
      content: "Strong impact detected on right side.",
      severity: "warning",
    },
    {
      type: "Tilt",
      content: "Box tilted back to safe range.",
      severity: "info",
    },
    {
      type: "Battery",
      content: "Battery level low: 18%.",
      severity: "warning",
    },
    { type: "Arm", content: "System armed by user.", severity: "info" },
    { type: "Disarm", content: "System disarmed by user.", severity: "info" },
    {
      type: "Open with alarm",
      content: "Unauthorized access attempt detected.",
      severity: "error",
    },
    {
      type: "Network",
      content: "Device reconnected to Wi‑Fi.",
      severity: "info",
    },
    {
      type: "Firmware",
      content: "Firmware update completed successfully.",
      severity: "info",
    },
  ];

  for (let i = 0; i < eventLogs.length; i++) {
    await prisma.eventLog.create({
      data: {
        ...eventLogs[i],
        timestamp: new Date(
          now.getTime() - (eventLogs.length - i) * 2 * 60 * 60 * 1000
        ),
        safeId,
      },
    });
  }

  console.log("Database seeded successfully!");
  console.log(`- ${sensorLogs.length} sensor logs created`);
  console.log(`- ${chartData.length} chart data points created`);
  console.log(`- ${statusEvents.length} status events created`);
  console.log(`- ${eventLogs.length} event logs created`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
