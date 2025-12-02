import express, { Request, Response } from "express";
import cors from "cors";
import dotenv from "dotenv";
import mqtt, { MqttClient } from "mqtt";
import { InfluxDB, Point, QueryApi, WriteApi, FluxTableMetaData } from "@influxdata/influxdb-client";
import { z } from "zod";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// InfluxDB Configuration
const INFLUXDB_URL = process.env.INFLUXDB_URL || "http://localhost:8086";
const INFLUXDB_TOKEN = process.env.INFLUXDB_TOKEN || "safebox-influxdb-token";
const INFLUXDB_ORG = process.env.INFLUXDB_ORG || "safebox";
const INFLUXDB_BUCKET = process.env.INFLUXDB_BUCKET || "iot-data";

// MQTT Configuration
const MQTT_BROKER_URL = process.env.MQTT_BROKER_URL || "mqtt://localhost:1883";

// Initialize InfluxDB client
const influxDB = new InfluxDB({ url: INFLUXDB_URL, token: INFLUXDB_TOKEN });
const writeApi: WriteApi = influxDB.getWriteApi(INFLUXDB_ORG, INFLUXDB_BUCKET, "ns");
const queryApi: QueryApi = influxDB.getQueryApi(INFLUXDB_ORG);

// MQTT Topics
const MQTT_TOPICS = {
  SENSOR_DATA: "safebox/sensor-data",
  SAFE_STATUS: "safebox/safe-status",
  ROTATION_DATA: "safebox/rotation-data",
  COMMAND: "safebox/command",
};

// Initialize MQTT client
let mqttClient: MqttClient;

function initMQTT() {
  mqttClient = mqtt.connect(MQTT_BROKER_URL, {
    clientId: `safebox-backend-${Date.now()}`,
    clean: true,
    connectTimeout: 4000,
    reconnectPeriod: 1000,
  });

  mqttClient.on("connect", () => {
    console.log("Connected to MQTT broker");

    // Subscribe to all topics
    Object.values(MQTT_TOPICS).forEach((topic) => {
      mqttClient.subscribe(topic, (err: Error | null) => {
        if (err) {
          console.error(`Failed to subscribe to ${topic}:`, err);
        } else {
          console.log(`Subscribed to ${topic}`);
        }
      });
    });
  });

  mqttClient.on("message", async (topic: string, message: Buffer) => {
    try {
      const payload = JSON.parse(message.toString());
      console.log(`Received message on ${topic}:`, payload);

      switch (topic) {
        case MQTT_TOPICS.SENSOR_DATA:
          await handleSensorData(payload);
          break;
        case MQTT_TOPICS.SAFE_STATUS:
          await handleSafeStatus(payload);
          break;
        case MQTT_TOPICS.ROTATION_DATA:
          await handleRotationData(payload);
          break;
        default:
          console.log(`Unknown topic: ${topic}`);
      }
    } catch (error) {
      console.error("Error processing MQTT message:", error);
    }
  });

  mqttClient.on("error", (error: Error) => {
    console.error("MQTT error:", error);
  });

  mqttClient.on("reconnect", () => {
    console.log("Reconnecting to MQTT broker...");
  });
}

// Validation schemas
const sensorDataSchema = z.object({
  sensorType: z.string(),
  value: z.number(),
  unit: z.string().optional(),
  safeId: z.string(),
});

const statusSchema = z.object({
  status: z.enum(["open", "lock", "unlock"]),
  safeId: z.string().optional(),
});

const rotationDataSchema = z.object({
  alpha: z.number(),
  beta: z.number(),
  gamma: z.number(),
  safeId: z.string(),
});

app.use(cors());
app.use(express.json());

// Handle sensor data from MQTT
async function handleSensorData(payload: unknown) {
  const data = sensorDataSchema.parse(payload);

  const point = new Point("sensor_data")
    .tag("safeId", data.safeId)
    .tag("sensorType", data.sensorType)
    .floatField("value", data.value);

  if (data.unit) {
    point.tag("unit", data.unit);
  }

  writeApi.writePoint(point);
  await writeApi.flush();

  // Check for high vibration and create event
  if (data.sensorType === "vibration" && data.value > 3000) {
    await createEventLog("Hit", "Strong impact detected on panel.", data.safeId);
  }

  console.log(`Sensor data written: ${data.sensorType} = ${data.value}`);
}

// Handle safe status from MQTT
async function handleSafeStatus(payload: unknown) {
  const data = statusSchema.parse(payload);
  const safeId = data.safeId || "safe-001";

  const point = new Point("safe_status")
    .tag("safeId", safeId)
    .stringField("status", data.status);

  writeApi.writePoint(point);
  await writeApi.flush();

  // Create event logs based on status
  if (data.status === "open") {
    await createEventLog("Open with alarm", "Lid opened while armed. Siren triggered.", safeId);
  } else if (data.status === "unlock") {
    await createEventLog("Unlock", "System disarmed(unlock) by user.", safeId);
  } else if (data.status === "lock") {
    await createEventLog("Lock", "System armed.", safeId);
  }

  console.log(`Safe status updated: ${data.status}`);
}

// Handle rotation data from MQTT
async function handleRotationData(payload: unknown) {
  const data = rotationDataSchema.parse(payload);

  const point = new Point("rotation_data")
    .tag("safeId", data.safeId)
    .floatField("alpha", data.alpha)
    .floatField("beta", data.beta)
    .floatField("gamma", data.gamma);

  writeApi.writePoint(point);
  await writeApi.flush();

  console.log(`Rotation data written: alpha=${data.alpha}, beta=${data.beta}, gamma=${data.gamma}`);
}

// Create event log
async function createEventLog(type: string, content: string, safeId: string, severity: string = "info") {
  const point = new Point("event_log")
    .tag("safeId", safeId)
    .tag("type", type)
    .tag("severity", severity)
    .stringField("content", content);

  writeApi.writePoint(point);
  await writeApi.flush();
}

// REST API endpoints (for backward compatibility and dashboard queries)

// POST sensor data (REST fallback)
app.post("/api/sensor-data", async (req: Request, res: Response) => {
  try {
    const data = sensorDataSchema.parse(req.body);
    await handleSensorData(data);
    res.json({ success: true, data });
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
    const safeIdFilter = safeId ? `and r.safeId == "${safeId}"` : "";

    const query = `
      from(bucket: "${INFLUXDB_BUCKET}")
        |> range(start: -24h)
        |> filter(fn: (r) => r._measurement == "sensor_data" ${safeIdFilter})
        |> sort(columns: ["_time"], desc: true)
        |> limit(n: ${parseInt(limit as string)})
    `;

    const results: any[] = [];
    await new Promise<void>((resolve, reject) => {
      queryApi.queryRows(query, {
        next(row: string[], tableMeta: FluxTableMetaData) {
          const o = tableMeta.toObject(row);
          results.push({
            sensorType: o.sensorType,
            value: o._value,
            unit: o.unit,
            timestamp: o._time,
            safeId: o.safeId,
          });
        },
        error(error: Error) {
          reject(error);
        },
        complete() {
          resolve();
        },
      });
    });

    res.json({ success: true, data: results });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

// POST safe status (REST fallback)
app.post("/api/safe-status", async (req: Request, res: Response) => {
  try {
    const data = statusSchema.parse(req.body);
    await handleSafeStatus(data);
    res.json({ success: true, data });
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
    const { safeId = "safe-001" } = req.query;

    const query = `
      from(bucket: "${INFLUXDB_BUCKET}")
        |> range(start: -30d)
        |> filter(fn: (r) => r._measurement == "safe_status" and r.safeId == "${safeId}")
        |> sort(columns: ["_time"], desc: true)
        |> limit(n: 1)
    `;

    let status: any = null;
    await new Promise<void>((resolve, reject) => {
      queryApi.queryRows(query, {
        next(row: string[], tableMeta: FluxTableMetaData) {
          const o = tableMeta.toObject(row);
          status = {
            status: o._value,
            timestamp: o._time,
            safeId: o.safeId,
          };
        },
        error(error: Error) {
          reject(error);
        },
        complete() {
          resolve();
        },
      });
    });

    res.json({ success: true, data: status });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

// POST rotation data (REST fallback)
app.post("/api/rotation-data", async (req: Request, res: Response) => {
  try {
    const data = rotationDataSchema.parse(req.body);
    await handleRotationData(data);
    res.json({ success: true, data });
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
    const safeIdFilter = safeId ? `and r.safeId == "${safeId}"` : "";

    const query = `
      from(bucket: "${INFLUXDB_BUCKET}")
        |> range(start: -24h)
        |> filter(fn: (r) => r._measurement == "rotation_data" ${safeIdFilter})
        |> pivot(rowKey:["_time"], columnKey: ["_field"], valueColumn: "_value")
        |> sort(columns: ["_time"], desc: true)
        |> limit(n: ${parseInt(limit as string)})
    `;

    const results: any[] = [];
    await new Promise<void>((resolve, reject) => {
      queryApi.queryRows(query, {
        next(row: string[], tableMeta: FluxTableMetaData) {
          const o = tableMeta.toObject(row);
          results.push({
            alpha: o.alpha,
            beta: o.beta,
            gamma: o.gamma,
            timestamp: o._time,
            safeId: o.safeId,
          });
        },
        error(error: Error) {
          reject(error);
        },
        complete() {
          resolve();
        },
      });
    });

    res.json({ success: true, data: results });
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

    const query = `
      from(bucket: "${INFLUXDB_BUCKET}")
        |> range(start: -24h)
        |> filter(fn: (r) => r._measurement == "rotation_data" and r.safeId == "${safeId}")
        |> pivot(rowKey:["_time"], columnKey: ["_field"], valueColumn: "_value")
        |> sort(columns: ["_time"], desc: true)
        |> limit(n: 1)
    `;

    let latestRotation: any = null;
    await new Promise<void>((resolve, reject) => {
      queryApi.queryRows(query, {
        next(row: string[], tableMeta: FluxTableMetaData) {
          const o = tableMeta.toObject(row);
          latestRotation = {
            alpha: o.alpha,
            beta: o.beta,
            gamma: o.gamma,
            timestamp: o._time,
            safeId: o.safeId,
          };
        },
        error(error: Error) {
          reject(error);
        },
        complete() {
          resolve();
        },
      });
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
    let lastHeartbeat = new Date().toISOString();
    let status = "OK";

    // Get latest sensor data timestamp
    const latestQuery = `
      from(bucket: "${INFLUXDB_BUCKET}")
        |> range(start: -24h)
        |> filter(fn: (r) => r._measurement == "sensor_data")
        |> sort(columns: ["_time"], desc: true)
        |> limit(n: 1)
    `;

    await new Promise<void>((resolve) => {
      queryApi.queryRows(latestQuery, {
        next(row: string[], tableMeta: FluxTableMetaData) {
          const o = tableMeta.toObject(row);
          lastHeartbeat = o._time;
          const timeDiff = Date.now() - new Date(o._time).getTime();
          if (timeDiff > 10000) {
            status = "WARN";
          }
        },
        error() {
          status = "WARN";
          resolve();
        },
        complete() {
          resolve();
        },
      });
    });

    // Get latest safe status
    const statusQuery = `
      from(bucket: "${INFLUXDB_BUCKET}")
        |> range(start: -30d)
        |> filter(fn: (r) => r._measurement == "safe_status")
        |> sort(columns: ["_time"], desc: true)
        |> limit(n: 1)
    `;

    await new Promise<void>((resolve) => {
      queryApi.queryRows(statusQuery, {
        next(row: string[], tableMeta: FluxTableMetaData) {
          const o = tableMeta.toObject(row);
          const rawStatus = o._value;
          if (rawStatus) {
            status = rawStatus.charAt(0).toUpperCase() + rawStatus.slice(1);
          }
        },
        error() {
          resolve();
        },
        complete() {
          resolve();
        },
      });
    });

    res.json({
      status,
      lastHeartbeat,
      mqttConnected: mqttClient?.connected || false,
    });
  } catch (error) {
    res.status(500).json({
      status: "WARN",
      lastHeartbeat: new Date().toISOString(),
      mqttConnected: mqttClient?.connected || false,
    });
  }
});

// Charts endpoint - get sensor data for visualization
app.get("/api/charts", async (req: Request, res: Response) => {
  try {
    const { safeId = "safe-001" } = req.query;

    // Query tilt and vibration data separately
    const tiltQuery = `
      from(bucket: "${INFLUXDB_BUCKET}")
        |> range(start: -24h)
        |> filter(fn: (r) => r._measurement == "sensor_data" and r.safeId == "${safeId}" and r.sensorType == "tilt")
        |> sort(columns: ["_time"], desc: true)
        |> limit(n: 30)
    `;

    const vibrationQuery = `
      from(bucket: "${INFLUXDB_BUCKET}")
        |> range(start: -24h)
        |> filter(fn: (r) => r._measurement == "sensor_data" and r.safeId == "${safeId}" and r.sensorType == "vibration")
        |> sort(columns: ["_time"], desc: true)
        |> limit(n: 30)
    `;

    const tiltData: any[] = [];
    const vibrationData: any[] = [];

    await Promise.all([
      new Promise<void>((resolve, reject) => {
        queryApi.queryRows(tiltQuery, {
          next(row: string[], tableMeta: FluxTableMetaData) {
            const o = tableMeta.toObject(row);
            tiltData.push({ timestamp: o._time, value: o._value });
          },
          error(error: Error) {
            reject(error);
          },
          complete() {
            resolve();
          },
        });
      }),
      new Promise<void>((resolve, reject) => {
        queryApi.queryRows(vibrationQuery, {
          next(row: string[], tableMeta: FluxTableMetaData) {
            const o = tableMeta.toObject(row);
            vibrationData.push({ timestamp: o._time, value: o._value });
          },
          error(error: Error) {
            reject(error);
          },
          complete() {
            resolve();
          },
        });
      }),
    ]);

    // Group data by second and calculate averages
    const secondlyData: Record<string, { tilt: number[]; vib: number[] }> = {};

    tiltData.forEach((data) => {
      const timestamp = new Date(data.timestamp);
      const timeKey = timestamp.toISOString();
      if (!secondlyData[timeKey]) {
        secondlyData[timeKey] = { tilt: [], vib: [] };
      }
      secondlyData[timeKey].tilt.push(parseFloat(data.value.toFixed(2)));
    });

    vibrationData.forEach((data) => {
      const timestamp = new Date(data.timestamp);
      const timeKey = timestamp.toISOString();
      if (!secondlyData[timeKey]) {
        secondlyData[timeKey] = { tilt: [], vib: [] };
      }
      secondlyData[timeKey].vib.push(parseFloat(data.value.toFixed(2)));
    });

    // Generate chart points
    const chartPoints = [];
    for (const [timeKey, data] of Object.entries(secondlyData)) {
      const tilt = data.tilt.length > 0
        ? data.tilt.reduce((a, b) => a + b, 0) / data.tilt.length
        : null;
      const vib = data.vib.length > 0
        ? data.vib.reduce((a, b) => a + b, 0) / data.vib.length
        : null;

      chartPoints.push({
        t: timeKey,
        tilt,
        vib,
      });
    }

    // Sort by time
    chartPoints.sort((a, b) => new Date(a.t).getTime() - new Date(b.t).getTime());

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

    const query = `
      from(bucket: "${INFLUXDB_BUCKET}")
        |> range(start: -7d)
        |> filter(fn: (r) => r._measurement == "event_log" and r.safeId == "${safeId}")
        |> sort(columns: ["_time"], desc: true)
    `;

    const results: any[] = [];
    await new Promise<void>((resolve, reject) => {
      queryApi.queryRows(query, {
        next(row: string[], tableMeta: FluxTableMetaData) {
          const o = tableMeta.toObject(row);
          results.push({
            type: o.type,
            content: o._value,
            timestamp: o._time,
          });
        },
        error(error: Error) {
          reject(error);
        },
        complete() {
          resolve();
        },
      });
    });

    // Sort results by timestamp descending (InfluxDB returns grouped by series, not globally sorted)
    results.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    // Apply limit after sorting
    const limitedResults = results.slice(0, parseInt(limit as string));

    res.json(limitedResults);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

// Publish command to MQTT
app.post("/api/command", async (req: Request, res: Response) => {
  try {
    const { command, safeId = "safe-001" } = req.body;

    if (!command) {
      return res.status(400).json({ success: false, error: "Command is required" });
    }

    mqttClient.publish(
      MQTT_TOPICS.COMMAND,
      JSON.stringify({ command, safeId, timestamp: new Date().toISOString() }),
      { qos: 1 },
      (error: Error | undefined) => {
        if (error) {
          res.status(500).json({ success: false, error: error.message });
        } else {
          res.json({ success: true, message: `Command '${command}' sent to ${safeId}` });
        }
      }
    );
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

// Initialize and start server
async function start() {
  try {
    // Initialize MQTT connection
    initMQTT();

    // Start Express server
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      console.log(`MQTT Broker: ${MQTT_BROKER_URL}`);
      console.log(`InfluxDB: ${INFLUXDB_URL}`);
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on("SIGINT", async () => {
  console.log("Shutting down...");

  if (mqttClient) {
    mqttClient.end();
  }

  await writeApi.close();
  process.exit(0);
});

start();
