"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import Link from "next/link";
import * as THREE from "three";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  XAxis,
  YAxis,
  ReferenceLine,
} from "recharts";
import {
  BellRing,
  DoorOpen,
  Ruler,
  Shield,
  Siren,
  Thermometer,
  WifiOff,
  Wrench,
  Zap,
  Activity,
  Database,
} from "lucide-react";
import { Canvas } from "@react-three/fiber";
import { Model } from "@/components/box-model";
import { OrbitControls } from "@react-three/drei";

const MAX_DATA_POINTS = 30; // Maximum number of points to show in realtime chart
const REALTIME_INTERVAL = 1000; // Update every 1 second

type LogEntry = { type: string; content: string; timestamp?: string };

const typeIcon: Record<string, React.ComponentType<{ className?: string }>> = {
  Hit: Zap,
  Tilt: Ruler,
  "Open with alarm": Siren,
  Open: DoorOpen,
  Vibration: Zap,
  Temperature: Thermometer,
  Battery: BellRing,
  Network: WifiOff,
  Firmware: Wrench,
  Arm: Shield,
  Disarm: Shield,
  Lock: Shield,
};

export default function DashboardPage() {
  const [armed, setArmed] = useState<boolean>(true);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [logsLoading, setLogsLoading] = useState<boolean>(false);
  const [tiltData, setTiltData] = useState<
    Array<{ t: string; tilt: number; displayTime: string }>
  >([]);
  const [vibrationData, setVibrationData] = useState<
    Array<{ t: string; vib: number; displayTime: string }>
  >([]);
  const [health, setHealth] = useState<{
    status: string;
    lastHeartbeat: string;
  } | null>(null);
  const [resetTrigger, setResetTrigger] = useState(0);
  const [isLive, setIsLive] = useState(true);
  const controlsRef = useRef<any>(null);
  const lastFetchTime = useRef<string | null>(null);

  // Format timestamp for display
  const formatTime = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
  };

  // Auto-fetch logs without showing loading indicator
  const fetchLogs = useCallback(async (showLoading = false) => {
    if (showLoading) setLogsLoading(true);
    try {
      const res = await fetch("/api/logs");
      const data: LogEntry[] = await res.json();
      setLogs(data);
    } catch (e) {
      console.error(e);
    } finally {
      if (showLoading) setLogsLoading(false);
    }
  }, []);

  // Manual refresh for logs
  const refreshLogs = () => {
    fetchLogs(true);
  };

  useEffect(() => {
    fetchLogs(true); // Show loading on initial fetch
    const id = setInterval(() => fetchLogs(false), 5_000); // Auto-fetch without loading
    return () => clearInterval(id);
  }, [fetchLogs]);

  // Realtime chart data fetching
  const fetchChartData = useCallback(async () => {
    if (!isLive) return;

    try {
      const res = await fetch("/api/charts");
      const data: Array<{ t: string; tilt: number; vib: number }> =
        await res.json();

      // Process and add display time for each data point
      const processedTiltData = data
        .filter((item) => item.tilt !== null && item.tilt !== undefined)
        .map((item) => ({
          t: item.t,
          tilt: item.tilt,
          displayTime: formatTime(item.t),
        }))
        .slice(-MAX_DATA_POINTS); // Keep only the last N points

      const processedVibrationData = data
        .filter((item) => item.vib !== null && item.vib !== undefined)
        .map((item) => ({
          t: item.t,
          vib: item.vib,
          displayTime: formatTime(item.t),
        }))
        .slice(-MAX_DATA_POINTS); // Keep only the last N points

      setTiltData(processedTiltData);
      setVibrationData(processedVibrationData);

      if (data.length > 0) {
        lastFetchTime.current = data[data.length - 1].t;
      }
    } catch (e) {
      console.error(e);
    }
  }, [isLive]);

  useEffect(() => {
    fetchChartData();
    const id = setInterval(fetchChartData, REALTIME_INTERVAL);
    return () => clearInterval(id);
  }, [fetchChartData]);

  useEffect(() => {
    // initial health fetch
    refreshHealth();
    const id = setInterval(refreshHealth, 500);
    return () => clearInterval(id);
  }, []);

  const refreshHealth = async () => {
    try {
      const res = await fetch("/api/health");
      const h = await res.json();
      setHealth(h);
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="font-sans min-h-screen p-6 md:p-10 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Safety Box Dashboard</h1>
        <Link href="/explorer">
          <Button variant="outline">
            <Database className="h-4 w-4 mr-2" />
            Data Explorer
          </Button>
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader className="absolute w-[20rem] flex justify-between items-center z-10">
            <div>
              <CardTitle>Safe Preview</CardTitle>
              <CardDescription>3D Preview of SafeBox</CardDescription>
            </div>
            <Button
              variant="outline"
              size="icon"
              onClick={() => {
                controlsRef.current?.reset();
                setResetTrigger((prev) => prev + 1);
              }}
              aria-label="Reset view and rotation"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="size-4"
              >
                <path d="M21 12a9 9 0 1 1-3-6.7" />
                <path d="M21 3v7h-7" />
              </svg>
            </Button>
          </CardHeader>
          <CardContent className="h-full w-full">
            <Canvas className="h-full w-full">
              <ambientLight intensity={2.5} />
              <directionalLight
                color={new THREE.Color(201, 149, 37)}
                position={[-2, 5, -5]}
                intensity={0.01}
              />
              <Model
                position={[0, -0.5, 0]}
                rotation={[0, 2, 0]}
                scale={[5, 5, 5]}
                resetTrigger={resetTrigger}
              />
              <OrbitControls ref={controlsRef} />
            </Canvas>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-start justify-between">
            <div>
              <CardTitle>Recent Activity</CardTitle>
              <CardDescription>Live events from the safety box</CardDescription>
            </div>
            <Button
              variant="outline"
              size="icon"
              aria-label="Refresh activity"
              onClick={refreshLogs}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="size-4"
              >
                <path d="M21 12a9 9 0 1 1-3-6.7" />
                <path d="M21 3v7h-7" />
              </svg>
            </Button>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-64">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">Type</TableHead>
                    <TableHead>Content</TableHead>
                    <TableHead className="w-20 text-right">Time</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logsLoading && (
                    <TableRow>
                      <TableCell colSpan={3} className="text-muted-foreground">
                        Loading…
                      </TableCell>
                    </TableRow>
                  )}
                  {!logsLoading && logs.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={3} className="text-muted-foreground">
                        No events
                      </TableCell>
                    </TableRow>
                  )}
                  {!logsLoading &&
                    logs.length > 0 &&
                    logs.map((log, idx) => {
                      const Icon = typeIcon[log.type] ?? BellRing;
                      return (
                        <TableRow key={idx}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Icon className="h-4 w-4 text-muted-foreground" />
                              <span className="text-xs font-medium">
                                {log.type}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="whitespace-pre-wrap">
                            {log.content}
                          </TableCell>
                          <TableCell className="text-right text-xs text-muted-foreground">
                            {log.timestamp ? formatTime(log.timestamp) : "-"}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                </TableBody>
              </Table>
            </ScrollArea>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                Sensor Trends
                {isLive && (
                  <span className="flex items-center gap-1 text-sm font-normal text-green-600">
                    <Activity className="h-3 w-3 animate-pulse" />
                    Live
                  </span>
                )}
              </CardTitle>
              <CardDescription>
                Real-time tilt and vibration monitoring
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Live</span>
              <Switch
                checked={isLive}
                onCheckedChange={setIsLive}
                aria-label="Toggle live updates"
              />
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              <ChartContainer
                config={{
                  tilt: {
                    label: "Tilt (°)",
                    color: "hsl(var(--primary))",
                  },
                }}
                className="h-64"
              >
                <AreaChart data={tiltData} margin={{ left: 8, right: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="displayTime"
                    tick={{ fontSize: 10 }}
                    interval="preserveStartEnd"
                    tickLine
                    axisLine
                  />
                  <YAxis width={32} domain={[0, 35]} />
                  <Area
                    type="monotone"
                    dataKey="tilt"
                    stroke="var(--color-tilt)"
                    fill="color-mix(in oklab, var(--color-tilt) 20%, transparent)"
                    isAnimationActive={false}
                  />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <ChartLegend content={<ChartLegendContent />} />
                </AreaChart>
              </ChartContainer>

              <ChartContainer
                config={{
                  vib: {
                    label: "Vibration",
                    // Use a high-contrast chart color token
                    color: "var(--chart-2)",
                  },
                }}
                className="h-64"
              >
                <LineChart data={vibrationData} margin={{ left: 8, right: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="displayTime"
                    tick={{ fontSize: 10 }}
                    interval="preserveStartEnd"
                    tickLine
                    axisLine
                  />
                  <YAxis width={32} />
                  <Line
                    type="monotone"
                    dataKey="vib"
                    stroke="var(--color-vib)"
                    strokeWidth={2}
                    dot={{ r: 2 }}
                    isAnimationActive={false}
                  />
                  <ReferenceLine
                    y={3000}
                    stroke="red"
                    strokeDasharray="5 5"
                    label={{ value: "Alert", position: "right", fontSize: 10 }}
                  />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <ChartLegend content={<ChartLegendContent />} />
                </LineChart>
              </ChartContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-1">
          <CardHeader className="flex flex-row items-start justify-between">
            <div>
              <CardTitle>Health Status</CardTitle>
              <CardDescription>Status and last heartbeat</CardDescription>
            </div>
            <Button
              variant="outline"
              size="icon"
              aria-label="Refresh health"
              onClick={refreshHealth}
            >
              {/* Refresh icon */}
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="size-4"
              >
                <path d="M21 12a9 9 0 1 1-3-6.7" />
                <path d="M21 3v7h-7" />
              </svg>
            </Button>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <div className="text-xs text-muted-foreground">Status</div>
                {health?.status !== "Lock" ? (
                  <div className="mt-1 font-bold text-red-600">
                    {health?.status ?? "-"}
                  </div>
                ) : (
                  <div className="mt-1 font-medium">
                    {health?.status ?? "-"}
                  </div>
                )}
              </div>
              <div>
                <div className="text-xs text-muted-foreground">
                  Last Heartbeat
                </div>
                <div className="mt-1 font-medium">
                  {health
                    ? new Date(health.lastHeartbeat).toLocaleString()
                    : "-"}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
