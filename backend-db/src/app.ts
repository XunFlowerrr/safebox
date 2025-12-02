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

// Alert state tracking to prevent duplicate events
// Key: "safeId:alertType", Value: { triggered: boolean, lastTriggered: Date }
const alertState: Map<string, { triggered: boolean; lastTriggered: Date | null }> = new Map();

// Cooldown period in milliseconds (prevent re-triggering for 5 seconds after condition clears)
const ALERT_COOLDOWN_MS = 5000;

// Track last received message time per safe for heartbeat
const lastMessageTime: Map<string, Date> = new Map();

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

  // Update last message time for heartbeat tracking
  lastMessageTime.set(data.safeId, new Date());

  const point = new Point("sensor_data")
    .tag("safeId", data.safeId)
    .tag("sensorType", data.sensorType)
    .floatField("value", data.value);

  if (data.unit) {
    point.tag("unit", data.unit);
  }

  writeApi.writePoint(point);
  await writeApi.flush();

  // Check for high vibration and create event (only on state transition)
  const vibrationKey = `${data.safeId}:vibration`;
  if (data.sensorType === "vibration") {
    const isHighVibration = data.value > 3000;
    const currentState = alertState.get(vibrationKey) || { triggered: false, lastTriggered: null };

    if (isHighVibration && !currentState.triggered) {
      // Transition from normal to high vibration - create event
      await createEventLog("Hit", "Strong impact detected on panel.", data.safeId, "warning");
      alertState.set(vibrationKey, { triggered: true, lastTriggered: new Date() });
    } else if (!isHighVibration && currentState.triggered) {
      // Transition from high to normal - reset state after cooldown
      const now = new Date();
      if (currentState.lastTriggered && (now.getTime() - currentState.lastTriggered.getTime() > ALERT_COOLDOWN_MS)) {
        alertState.set(vibrationKey, { triggered: false, lastTriggered: null });
      }
    }
  }

  // Check for abnormal tilt and create event (only on state transition)
  const tiltKey = `${data.safeId}:tilt`;
  if (data.sensorType === "tilt") {
    const isAbnormalTilt = data.value > 3.5;
    const currentState = alertState.get(tiltKey) || { triggered: false, lastTriggered: null };

    if (isAbnormalTilt && !currentState.triggered) {
      // Transition from normal to abnormal tilt - create event
      await createEventLog("Abnormal tilt detected", "Safe has been tilted abnormally.", data.safeId, "warning");
      alertState.set(tiltKey, { triggered: true, lastTriggered: new Date() });
    } else if (!isAbnormalTilt && currentState.triggered) {
      // Transition from abnormal to normal - reset state after cooldown
      const now = new Date();
      if (currentState.lastTriggered && (now.getTime() - currentState.lastTriggered.getTime() > ALERT_COOLDOWN_MS)) {
        alertState.set(tiltKey, { triggered: false, lastTriggered: null });
      }
    }
  }

  console.log(`Sensor data written: ${data.sensorType} = ${data.value}`);
}

// Handle safe status from MQTT
// Track last status per safe to prevent duplicate events
const lastSafeStatus: Map<string, string> = new Map();

async function handleSafeStatus(payload: unknown) {
  const data = statusSchema.parse(payload);
  const safeId = data.safeId || "safe-001";

  const point = new Point("safe_status")
    .tag("safeId", safeId)
    .stringField("status", data.status);

  writeApi.writePoint(point);
  await writeApi.flush();

  // Only create event logs when status actually changes
  const previousStatus = lastSafeStatus.get(safeId);
  if (previousStatus !== data.status) {
    lastSafeStatus.set(safeId, data.status);

    if (data.status === "open") {
      await createEventLog("Open with alarm", "Lid opened while armed. Siren triggered.", safeId, "critical");
    } else if (data.status === "unlock") {
      await createEventLog("Unlock", "System disarmed(unlock) by user.", safeId, "info");
    } else if (data.status === "lock") {
      await createEventLog("Lock", "System armed.", safeId, "info");
    }
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
    const { safeId = "safe-001" } = req.query;

    // Get last heartbeat from in-memory tracking (real-time)
    const lastMessage = lastMessageTime.get(safeId as string);
    const lastHeartbeat = lastMessage ? lastMessage.toISOString() : null;

    // Check if we've received data recently (within 5 seconds)
    let connectionStatus: "OK" | "WARN" | "ERROR" = "ERROR";
    if (lastMessage) {
      const timeDiff = Date.now() - lastMessage.getTime();
      if (timeDiff <= 5000) {
        connectionStatus = "OK";
      } else if (timeDiff <= 30000) {
        connectionStatus = "WARN";
      } else {
        connectionStatus = "ERROR";
      }
    }

    // Get latest safe status from in-memory tracking
    const safeStatus = lastSafeStatus.get(safeId as string) || "unknown";

    res.json({
      status: connectionStatus,
      safeStatus: safeStatus.charAt(0).toUpperCase() + safeStatus.slice(1),
      lastHeartbeat: lastHeartbeat || new Date().toISOString(),
      mqttConnected: mqttClient?.connected || false,
    });
  } catch (error) {
    res.status(500).json({
      status: "ERROR",
      safeStatus: "Unknown",
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
            severity: o.severity || "info",
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

// Data Explorer endpoint - query any measurement with filters and sorting
app.get("/api/explorer", async (req: Request, res: Response) => {
  try {
    const {
      measurement = "sensor_data",
      limit = "50",
      offset = "0",
      sortField = "timestamp",
      sortDirection = "desc",
      startTime,
      endTime,
      sensorType,
      eventType,
      safeId = "safe-001",
    } = req.query;

    // Determine time range
    const start = startTime ? new Date(startTime as string).toISOString() : "-30d";
    const stop = endTime ? new Date(endTime as string).toISOString() : "now()";

    // Build filters based on measurement type
    let filters = `r._measurement == "${measurement}" and r.safeId == "${safeId}"`;

    if (measurement === "sensor_data" && sensorType) {
      filters += ` and r.sensorType == "${sensorType}"`;
    }
    if (measurement === "event_log" && eventType) {
      filters += ` and r.type == "${eventType}"`;
    }

    // Build query based on measurement type
    let query: string;

    if (measurement === "rotation_data") {
      query = `
        from(bucket: "${INFLUXDB_BUCKET}")
          |> range(start: ${startTime ? start : "-30d"}, stop: ${endTime ? stop : "now()"})
          |> filter(fn: (r) => ${filters})
          |> pivot(rowKey:["_time"], columnKey: ["_field"], valueColumn: "_value")
      `;
    } else {
      query = `
        from(bucket: "${INFLUXDB_BUCKET}")
          |> range(start: ${startTime ? start : "-30d"}, stop: ${endTime ? stop : "now()"})
          |> filter(fn: (r) => ${filters})
      `;
    }

    const results: any[] = [];
    await new Promise<void>((resolve, reject) => {
      queryApi.queryRows(query, {
        next(row: string[], tableMeta: FluxTableMetaData) {
          const o = tableMeta.toObject(row);

          // Format based on measurement type
          switch (measurement) {
            case "sensor_data":
              results.push({
                timestamp: o._time,
                sensorType: o.sensorType,
                value: o._value,
                unit: o.unit || "",
                safeId: o.safeId,
              });
              break;
            case "safe_status":
              results.push({
                timestamp: o._time,
                status: o._value,
                safeId: o.safeId,
              });
              break;
            case "rotation_data":
              results.push({
                timestamp: o._time,
                alpha: o.alpha,
                beta: o.beta,
                gamma: o.gamma,
                safeId: o.safeId,
              });
              break;
            case "event_log":
              results.push({
                timestamp: o._time,
                type: o.type,
                content: o._value,
                severity: o.severity || "info",
                safeId: o.safeId,
              });
              break;
            default:
              results.push({
                timestamp: o._time,
                value: o._value,
                ...o,
              });
          }
        },
        error(error: Error) {
          reject(error);
        },
        complete() {
          resolve();
        },
      });
    });

    // Sort results
    const sortDir = sortDirection === "asc" ? 1 : -1;
    results.sort((a, b) => {
      const aVal = a[sortField as string];
      const bVal = b[sortField as string];

      if (sortField === "timestamp") {
        return sortDir * (new Date(aVal).getTime() - new Date(bVal).getTime());
      }
      if (typeof aVal === "number" && typeof bVal === "number") {
        return sortDir * (aVal - bVal);
      }
      return sortDir * String(aVal).localeCompare(String(bVal));
    });

    // Apply pagination
    const limitNum = parseInt(limit as string);
    const offsetNum = parseInt(offset as string);
    const paginatedResults = results.slice(offsetNum, offsetNum + limitNum);

    res.json({
      success: true,
      data: paginatedResults,
      total: results.length,
      limit: limitNum,
      offset: offsetNum,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      data: [],
      total: 0,
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
      { qos: 0 },
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
