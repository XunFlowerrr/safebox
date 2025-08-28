"use client";

import { useEffect, useState } from "react";
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
} from "lucide-react";

type LogEntry = { type: string; content: string };

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
};

export default function DashboardPage() {
  const [armed, setArmed] = useState<boolean>(true);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [sensorData, setSensorData] = useState<
    Array<{ t: string; tilt: number; vib: number }>
  >([]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/logs");
        const data: LogEntry[] = await res.json();
        setLogs(data);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    load();
    const id = setInterval(load, 15_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const loadCharts = async () => {
      try {
        const res = await fetch("/api/charts");
        const data: Array<{ t: string; tilt: number; vib: number }> =
          await res.json();
        setSensorData(data);
      } catch (e) {
        console.error(e);
      }
    };
    loadCharts();
    const id = setInterval(loadCharts, 30_000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="font-sans min-h-screen p-6 md:p-10 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Safety Box Dashboard</h1>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">Armed</span>
          <Switch
            checked={armed}
            onCheckedChange={setArmed}
            aria-label="Arm safety"
          />
          <Badge
            className={
              armed ? "bg-green-600 text-white" : "bg-yellow-500 text-black"
            }
          >
            {armed ? "ON" : "OFF"}
          </Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Sensor Trends</CardTitle>
            <CardDescription>
              Tilt and vibration over time (mock)
            </CardDescription>
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
                <AreaChart data={sensorData} margin={{ left: 8, right: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="t" hide tickLine axisLine />
                  <YAxis width={32} domain={[0, 50]} />
                  <Area
                    type="monotone"
                    dataKey="tilt"
                    stroke="var(--color-tilt)"
                    fill="color-mix(in oklab, var(--color-tilt) 20%, transparent)"
                  />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <ChartLegend content={<ChartLegendContent />} />
                </AreaChart>
              </ChartContainer>

              <ChartContainer
                config={{
                  vib: {
                    label: "Vibration",
                    color: "hsl(var(--muted-foreground))",
                  },
                }}
                className="h-64"
              >
                <LineChart data={sensorData} margin={{ left: 8, right: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="t" hide tickLine axisLine />
                  <YAxis width={32} />
                  <Line
                    type="monotone"
                    dataKey="vib"
                    stroke="var(--color-vib)"
                    dot={false}
                  />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <ChartLegend content={<ChartLegendContent />} />
                </LineChart>
              </ChartContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
            <CardDescription>Live events from the safety box</CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-64">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">Type</TableHead>
                    <TableHead>Content</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading && (
                    <TableRow>
                      <TableCell colSpan={2} className="text-muted-foreground">
                        Loading…
                      </TableCell>
                    </TableRow>
                  )}
                  {!loading && logs.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={2} className="text-muted-foreground">
                        No events
                      </TableCell>
                    </TableRow>
                  )}
                  {!loading &&
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
                        </TableRow>
                      );
                    })}
                </TableBody>
              </Table>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
