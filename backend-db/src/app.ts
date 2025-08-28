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

    const status = await prisma.safeStatus.create({
      data: {
        status: data.status,
      },
    });
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

// GET dashboard data
app.get("/api/dashboard", async (req: Request, res: Response) => {
  try {
    const [currentStatus, recentLogs]: [
      Awaited<ReturnType<typeof prisma.safeStatus.findFirst>>,
      Awaited<ReturnType<typeof prisma.sensorLog.findMany>>
    ] = await Promise.all([
      prisma.safeStatus.findFirst({
        orderBy: { timestamp: "desc" },
      }),
      prisma.sensorLog.findMany({
        orderBy: { timestamp: "desc" },
        take: 10,
      }),
    ]);

    res.json({
      success: true,
      data: {
        status: currentStatus,
        recentLogs: recentLogs,
      },
    });
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
    let status: "OK" | "WARN" | "ERROR" = "OK";

    if (latestSensorData) {
      const timeDiff = now.getTime() - latestSensorData.timestamp.getTime();
      const minutesSinceLastData = Math.floor(timeDiff / (1000 * 60));

      // If no data in last 15 minutes, warn. If no data in last 30 minutes, error
      if (minutesSinceLastData > 30) {
        status = "ERROR";
      } else if (minutesSinceLastData > 15) {
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
      status: "ERROR",
      lastHeartbeat: new Date().toISOString(),
    });
  }
});

// Charts endpoint - get sensor data for visualization
app.get("/api/charts", async (req: Request, res: Response) => {
  try {
    const { safeId = "safe-001", hours = "24" } = req.query;
    const hoursBack = parseInt(hours as string);

    // First try to get pre-aggregated chart data
    const today = new Date().toISOString().split("T")[0];
    const chartData = await prisma.chartData.findMany({
      where: {
        safeId: safeId as string,
        date: today,
      },
      orderBy: { hour: "asc" },
    });

    // If we have pre-aggregated data, use it
    if (chartData.length > 0) {
      const response = chartData.map(
        (data: { hour: any; tilt: any; vibration: any }) => ({
          t: `${data.hour}:00`,
          tilt: data.tilt,
          vib: data.vibration,
        })
      );
      return res.json(response);
    }

    // Fallback to calculating from sensor logs
    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - hoursBack * 60 * 60 * 1000);

    const sensorData = await prisma.sensorLog.findMany({
      where: {
        safeId: safeId as string,
        timestamp: {
          gte: startTime,
          lte: endTime,
        },
        sensorType: {
          in: ["accelerometer", "vibration"],
        },
      },
      orderBy: { timestamp: "asc" },
    });

    // Group data by hour and calculate averages
    const hourlyData: Record<string, { tilt: number[]; vib: number[] }> = {};

    sensorData.forEach((data: any) => {
      const hour = data.timestamp.getHours();
      const timeKey = `${hour}:00`;

      if (!hourlyData[timeKey]) {
        hourlyData[timeKey] = { tilt: [], vib: [] };
      }

      if (data.sensorType === "accelerometer") {
        // Convert accelerometer reading to tilt angle (matches mock pattern)
        const tiltAngle = Math.min(45, Math.abs(data.value) * 10);
        hourlyData[timeKey].tilt.push(tiltAngle);
      } else if (data.sensorType === "vibration") {
        hourlyData[timeKey].vib.push(data.value);
      }
    });

    // Create chart data points matching the mock pattern
    const chartPoints = [];
    for (let i = 0; i < hoursBack; i++) {
      const hour = (endTime.getHours() - hoursBack + i + 24) % 24;
      const timeKey = `${hour}:00`;

      // Use mock pattern if no real data
      let tilt = 0;
      let vib = 0;

      if (hourlyData[timeKey]) {
        tilt =
          hourlyData[timeKey].tilt.length > 0
            ? hourlyData[timeKey].tilt.reduce((a, b) => a + b, 0) /
              hourlyData[timeKey].tilt.length
            : 0;

        vib =
          hourlyData[timeKey].vib.length > 0
            ? hourlyData[timeKey].vib.reduce((a, b) => a + b, 0) /
              hourlyData[timeKey].vib.length
            : 0;
      }

      // If no data, generate mock pattern
      if (tilt === 0 && vib === 0) {
        const base = 10 + Math.abs(Math.sin(i / 3)) * 15;
        const spike = i % 7 === 0 ? 12 : 0;
        tilt = Math.min(45, Number((base + spike).toFixed(1)));
        vib = Math.max(
          0,
          Math.round(2 + Math.cos(i / 2) * 1.5 + (i % 5 === 0 ? 3 : 0))
        );
      }

      chartPoints.push({
        t: timeKey,
        tilt: Number(tilt.toFixed(1)),
        vib: Math.round(vib),
      });
    }

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
      }

      const response: EventLogResponse[] = eventLogs.map(
        (log: { type: string; content: string }) => ({
          type: log.type,
          content: log.content,
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
