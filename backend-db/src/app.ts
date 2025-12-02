import express, { Request, Response } from "express";
import cors from "cors";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import { z } from "zod";

dotenv.config();

const app = express();
const prisma = new PrismaClient();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Validation schemas
const sensorDataSchema = z.object({
  sensorType: z.string(),
  value: z.number(),
  unit: z.string().optional(),
  safeId: z.string(),
});

const statusSchema = z.object({
  status: z.enum(["open", "lock", "unlock"]),
});

const rotationDataSchema = z.object({
  alpha: z.number(),
  beta: z.number(),
  gamma: z.number(),
  safeId: z.string(),
});

// Additional validation schemas for new endpoints
const healthResponseSchema = z.object({
  status: z.enum(["OK", "WARN", "ERROR"]),
  lastHeartbeat: z.string(),
});

const chartQuerySchema = z.object({
  safeId: z.string().optional(),
  hours: z.string().default("24"),
});

const logsQuerySchema = z.object({
  safeId: z.string().optional(),
  limit: z.string().default("50"),
});

// POST sensor data from gateway
app.post("/api/sensor-data", async (req: Request, res: Response) => {
  try {
    const data = sensorDataSchema.parse(req.body);

    const sensorLog = await prisma.sensorLog.create({
      data: {
        sensorType: data.sensorType,
        value: data.value,
        unit: data.unit,
        safeId: data.safeId,
      },
    });

    if (data.sensorType === "vibration" && data.value > 3000) {
      // if latest and new status is same skip
      const latest = await prisma.eventLog.findFirst({
        orderBy: { timestamp: "desc" },
      });

      if (latest && latest.type !== "Hit") {
        await prisma.eventLog.create({
          data: {
            type: "Hit",
            content: "Strong impact detected on panel.",
            safeId: "safe-001",
          },
        });
      }
    }

    res.json({ success: true, data: sensorLog });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

// GET sensor logs
app.get("/api/sensor-data", async (req: Request, res: Response) => {
  try {
    const { safeId, limit = "50" } = req.query;

    const logs = await prisma.sensorLog.findMany({
      where: safeId ? { safeId: safeId as string } : {},
      orderBy: { timestamp: "desc" },
      take: parseInt(limit as string),
    });
    res.json({ success: true, data: logs });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

// POST safe status
app.post("/api/safe-status", async (req: Request, res: Response) => {
  try {
    const data = statusSchema.parse(req.body);

    // if latest and new status is same skip
    const latest = await prisma.safeStatus.findFirst({
      orderBy: { timestamp: "desc" },
    });

    if (latest && latest.status === data.status) {
      return res.json({ success: true, data: latest });
    }

    const status = await prisma.safeStatus.create({
      data: {
        status: data.status,
      },
    });

    if (data.status === "open") {
      // Create an event log for opening while armed
      await prisma.eventLog.create({
        data: {
          type: "Open with alarm",
          content: "Lid opened while armed. Siren triggered.",
          safeId: "safe-001",
        },
      });
    } else if (data.status === "unlock") {
      // Create an event log for disarming
      await prisma.eventLog.create({
        data: {
          type: "Unlock",
          content: "System disarmed(unlock) by user.",
          safeId: "safe-001",
        },
      });
    } else if (data.status === "lock") {
      // Create an event log for arming
      await prisma.eventLog.create({
        data: {
          type: "Lock",
          content: "System armed.",
          safeId: "safe-001",
        },
      });
    }
    res.json({ success: true, data: status });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

// GET current safe status
app.get("/api/safe-status", async (req: Request, res: Response) => {
  try {
    const status = await prisma.safeStatus.findFirst({
      orderBy: { timestamp: "desc" },
    });
    res.json({ success: true, data: status });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

// POST rotation data
app.post("/api/rotation-data", async (req: Request, res: Response) => {
  try {
    const data = rotationDataSchema.parse(req.body);

    const rotationLog = await prisma.rotationLog.create({
      data: {
        alpha: data.alpha,
        beta: data.beta,
        gamma: data.gamma,
        safeId: data.safeId,
      },
    });

    res.json({ success: true, data: rotationLog });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

// GET rotation logs
app.get("/api/rotation-data", async (req: Request, res: Response) => {
  try {
    const { safeId, limit = "50" } = req.query;

    const logs = await prisma.rotationLog.findMany({
      where: safeId ? { safeId: safeId as string } : {},
      orderBy: { timestamp: "desc" },
      take: parseInt(limit as string),
    });
    res.json({ success: true, data: logs });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

// GET latest rotation data
app.get("/api/rotation-data/latest", async (req: Request, res: Response) => {
  try {
    const { safeId = "safe-001" } = req.query;

    const latestRotation = await prisma.rotationLog.findFirst({
      where: { safeId: safeId as string },
      orderBy: { timestamp: "desc" },
    });

    res.json({ success: true, data: latestRotation });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

// Health check endpoint
app.get("/api/health", async (req: Request, res: Response) => {
  try {
    // Check database connectivity
    await prisma.$queryRaw`SELECT 1`;

    // Get latest sensor data to determine status
    const latestSensorData = await prisma.sensorLog.findFirst({
      orderBy: { timestamp: "desc" },
    });

    const now = new Date();
    let status = "OK";

    const raw_status = await prisma.safeStatus.findFirst({
      orderBy: { timestamp: "desc" },
    });
    status = raw_status
      ? raw_status.status.charAt(0).toUpperCase() + raw_status.status.slice(1)
      : "WARN";

    if (latestSensorData) {
      const timeDiff = now.getTime() - latestSensorData.timestamp.getTime();
      const secondsSinceLastData = timeDiff / 1000;

      if (secondsSinceLastData > 10) {
        status = "WARN";
      }
    } else {
      status = "WARN"; // No data available
    }

    res.json({
      status,
      lastHeartbeat:
        latestSensorData?.timestamp.toISOString() || now.toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      status: "WARN",
      lastHeartbeat: new Date().toISOString(),
    });
  }
});

// Charts endpoint - get sensor data for visualization
app.get("/api/charts", async (req: Request, res: Response) => {
  try {
    const { safeId = "safe-001", hours = "24" } = req.query;

    // Query sensor data separately for each sensor type
    const [tiltData, vibrationData] = await Promise.all([
      prisma.sensorLog.findMany({
        where: {
          safeId: safeId as string,
          sensorType: "tilt",
        },
        orderBy: { timestamp: "desc" },
        take: 30,
      }),
      prisma.sensorLog.findMany({
        where: {
          safeId: safeId as string,
          sensorType: "vibration",
        },
        orderBy: { timestamp: "desc" },
        take: 30,
      }),
    ]);

    // Combine the sensor data
    const sensorData = [...tiltData, ...vibrationData];

    console.log("Raw sensor data fetched:", {
      tilt: tiltData.length,
      vibration: vibrationData.length,
      total: sensorData.length,
    }); // Group data by second and calculate averages
    const secondlyData: Record<string, { tilt: number[]; vib: number[] }> = {};

    let minTime = new Date();
    sensorData.forEach((data: any) => {
      const raw_timestamp = new Date(data.timestamp);
      const timestamp = new Date(raw_timestamp.getTime() + 7 * 60 * 60 * 1000); // Convert to Thai time (UTC+7)
      const timeKey = timestamp.toISOString();
      minTime = timestamp < minTime ? timestamp : minTime;
      if (!secondlyData[timeKey]) {
        secondlyData[timeKey] = { tilt: [], vib: [] };
      }
      if (data.sensorType === "tilt") {
        // Use raw accelerometer value
        secondlyData[timeKey].tilt.push(parseFloat(data.value.toFixed(2)));
      } else if (data.sensorType === "vibration") {
        secondlyData[timeKey].vib.push(parseFloat(data.value.toFixed(2)));
      }
    });

    console.log("Grouped secondly data:", secondlyData);

    // Generate chart points for each second in the time range
    const chartPoints = [];

    for (const [timeKey, _] of Object.entries(secondlyData)) {
      let tilt = null;
      let vib = null;

      if (secondlyData[timeKey]) {
        tilt =
          secondlyData[timeKey].tilt.length > 0
            ? secondlyData[timeKey].tilt.reduce((a, b) => a + b, 0) /
              secondlyData[timeKey].tilt.length
            : null;

        vib =
          secondlyData[timeKey].vib.length > 0
            ? secondlyData[timeKey].vib.reduce((a, b) => a + b, 0) /
              secondlyData[timeKey].vib.length
            : null;
      }

      chartPoints.push({
        t: timeKey,
        tilt: tilt,
        vib: vib,
      });
    }

    // reverst order chartPoints
    chartPoints.sort(
      (a, b) => new Date(a.t).getTime() - new Date(b.t).getTime()
    );

    console.log("Processed chart data points:", chartPoints);

    res.json(chartPoints);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

// Logs endpoint - get system events and alerts
app.get("/api/logs", async (req: Request, res: Response) => {
  try {
    const { safeId = "safe-001", limit = "50" } = req.query;

    // First try to get pre-created event logs
    const eventLogs = await prisma.eventLog.findMany({
      where: {
        safeId: safeId as string,
      },
      orderBy: { timestamp: "desc" },
      take: parseInt(limit as string),
    });

    // If we have event logs, return them
    if (eventLogs.length > 0) {
      interface EventLogResponse {
        type: string;
        content: string;
        timestamp: string;
      }

      const response: EventLogResponse[] = eventLogs.map(
        (log: { type: string; content: string; timestamp: Date }) => ({
          type: log.type,
          content: log.content,
          timestamp: log.timestamp.toISOString(),
        })
      );
      return res.json(response);
    }

    // Fallback: Generate events from sensor logs and status changes
    const [sensorLogs, statusChanges] = await Promise.all([
      prisma.sensorLog.findMany({
        where: { safeId: safeId as string },
        orderBy: { timestamp: "desc" },
        take: parseInt(limit as string) / 2,
      }),
      prisma.safeStatus.findMany({
        where: { safeId: safeId as string },
        orderBy: { timestamp: "desc" },
        take: parseInt(limit as string) / 2,
      }),
    ]);

    // Convert sensor logs to event logs
    const dynamicEventLogs: Array<{
      type: string;
      content: string;
      timestamp: Date;
    }> = [];

    // Process sensor logs
    sensorLogs.forEach((log: any) => {
      let type = "";
      let content = "";

      switch (log.sensorType) {
        case "vibration":
          if (log.value > 5) {
            type = "Vibration";
            content = `High vibration level detected (${log.value}).`;
          }
          break;
        case "accelerometer":
          const tiltAngle = Math.abs(log.value) * 10;
          if (tiltAngle > 30) {
            type = "Tilt";
            content = `Box tilted beyond 30° on ${
              log.value > 0 ? "Y" : "X"
            }-axis.`;
          }
          break;
        case "magnetic_hall":
          if (log.value < 0.5) {
            type = "Open";
            content = "Lid opened while disarmed.";
          }
          break;
        case "buzzer":
          type = "Hit";
          content = "Impact detected on panel.";
          break;
        case "temperature":
          if (log.value > 35) {
            type = "Temperature";
            content = `Temperature rose to ${log.value.toFixed(1)}°C.`;
          }
          break;
        case "battery":
          if (log.value < 20) {
            type = "Battery";
            content = `Battery level low: ${Math.round(log.value)}%.`;
          }
          break;
      }

      if (type && content) {
        dynamicEventLogs.push({
          type,
          content,
          timestamp: log.timestamp,
        });
      }
    });

    // Process status changes
    statusChanges.forEach((status: any) => {
      let type = "";
      let content = "";

      switch (status.status) {
        case "lock":
          type = "Arm";
          content = "System armed by user.";
          break;
        case "unlock":
          type = "Disarm";
          content = "System disarmed by user.";
          break;
        case "open":
          type = "Open with alarm";
          content = "Lid opened while armed. Siren triggered.";
          break;
      }

      if (type && content) {
        dynamicEventLogs.push({
          type,
          content,
          timestamp: status.timestamp,
        });
      }
    });

    // Sort by timestamp and format response
    const sortedLogs = dynamicEventLogs
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, parseInt(limit as string))
      .map((log) => ({
        type: log.type,
        content: log.content,
        timestamp: log.timestamp.toISOString(),
      }));

    res.json(sortedLogs);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
