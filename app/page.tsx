"use client";

import { useEffect, useState, useRef } from "react";
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
import { Canvas } from "@react-three/fiber";
import { Model } from "@/components/box-model";
import { OrbitControls } from "@react-three/drei";

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
  Lock: Shield,
};

export default function DashboardPage() {
  const [armed, setArmed] = useState<boolean>(true);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [tiltData, setTiltData] = useState<Array<{ t: string; tilt: number }>>(
    []
  );
  const [vibrationData, setVibrationData] = useState<
    Array<{ t: string; vib: number }>
  >([]);
  const [health, setHealth] = useState<{
    status: string;
    lastHeartbeat: string;
  } | null>(null);
  const [resetTrigger, setResetTrigger] = useState(0);
  const controlsRef = useRef<any>(null);

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
    const id = setInterval(load, 5_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const loadCharts = async () => {
      try {
        const res = await fetch("/api/charts");
        const data: Array<{ t: string; tilt: number; vib: number }> =
          await res.json();

        // Filter and separate data by sensor type, removing null values
        const filteredTiltData = data
          .filter((item) => item.tilt !== null && item.tilt !== undefined)
          .map((item) => ({ t: item.t, tilt: item.tilt }));

        const filteredVibrationData = data
          .filter((item) => item.vib !== null && item.vib !== undefined)
          .map((item) => ({ t: item.t, vib: item.vib }));

        setTiltData(filteredTiltData);
        setVibrationData(filteredVibrationData);
      } catch (e) {
        console.error(e);
      }
    };
    loadCharts();
    const id = setInterval(loadCharts, 5_000);
    return () => clearInterval(id);
  }, []);

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
    <div className='font-sans min-h-screen p-6 md:p-10 space-y-6'>
      <div className='flex items-center justify-between'>
        <h1 className='text-2xl font-semibold'>Safety Box Dashboard</h1>
        {/* <div className='flex items-center gap-3'>
          <span className='text-sm text-muted-foreground'>Armed</span>
          <Switch
            checked={armed}
            onCheckedChange={setArmed}
            aria-label='Arm safety'
          />
          <Badge
            className={
              armed ? "bg-green-600 text-white" : "bg-yellow-500 text-black"
            }
          >
            {armed ? "ON" : "OFF"}
          </Badge>
        </div> */}
      </div>

      <div className='grid grid-cols-1 lg:grid-cols-3 gap-6'>
        <Card className='lg:col-span-2'>
          <CardHeader className='absolute w-[20rem] flex justify-between items-center z-10'>
            <div>
              <CardTitle>Safe Preview</CardTitle>
              <CardDescription>3D Preview of SafeBox</CardDescription>
            </div>
            <Button
              variant='outline'
              size='icon'
              onClick={() => {
                controlsRef.current?.reset();
                setResetTrigger((prev) => prev + 1);
              }}
              aria-label='Reset view and rotation'
            >
              <svg
                xmlns='http://www.w3.org/2000/svg'
                viewBox='0 0 24 24'
                fill='none'
                stroke='currentColor'
                strokeWidth='2'
                strokeLinecap='round'
                strokeLinejoin='round'
                className='size-4'
              >
                <path d='M21 12a9 9 0 1 1-3-6.7' />
                <path d='M21 3v7h-7' />
              </svg>
            </Button>
          </CardHeader>
          <CardContent className='h-full w-full'>
            <Canvas className='h-full w-full'>
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
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
            <CardDescription>Live events from the safety box</CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className='h-64'>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className='w-10'>Type</TableHead>
                    <TableHead>Content</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading && (
                    <TableRow>
                      <TableCell colSpan={2} className='text-muted-foreground'>
                        Loading…
                      </TableCell>
                    </TableRow>
                  )}
                  {!loading && logs.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={2} className='text-muted-foreground'>
                        No events
                      </TableCell>
                    </TableRow>
                  )}
                  {!loading &&
                    logs.length > 0 &&
                    logs.map((log, idx) => {
                      const Icon = typeIcon[log.type] ?? BellRing;
                      return (
                        <TableRow key={idx}>
                          <TableCell>
                            <div className='flex items-center gap-2'>
                              <Icon className='h-4 w-4 text-muted-foreground' />
                              <span className='text-xs font-medium'>
                                {log.type}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className='whitespace-pre-wrap'>
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

        <Card className='lg:col-span-2'>
          <CardHeader>
            <CardTitle>Sensor Trends</CardTitle>
            <CardDescription>Tilt and vibration over time</CardDescription>
          </CardHeader>
          <CardContent>
            <div className='grid grid-cols-1 xl:grid-cols-2 gap-6'>
              <ChartContainer
                config={{
                  tilt: {
                    label: "Tilt (°)",
                    color: "hsl(var(--primary))",
                  },
                }}
                className='h-64'
              >
                <AreaChart data={tiltData} margin={{ left: 8, right: 8 }}>
                  <CartesianGrid strokeDasharray='3 3' />
                  <XAxis dataKey='t' hide tickLine axisLine />
                  <YAxis width={32} domain={[0, 35]} />
                  <Area
                    type='monotone'
                    dataKey='tilt'
                    stroke='var(--color-tilt)'
                    fill='color-mix(in oklab, var(--color-tilt) 20%, transparent)'
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
                className='h-64'
              >
                <LineChart data={vibrationData} margin={{ left: 8, right: 8 }}>
                  <CartesianGrid strokeDasharray='3 3' />
                  <XAxis dataKey='t' hide tickLine axisLine />
                  <YAxis width={32} />
                  <Line
                    type='monotone'
                    dataKey='vib'
                    stroke='var(--color-vib)'
                    strokeWidth={2}
                    dot={{ r: 2 }}
                  />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <ChartLegend content={<ChartLegendContent />} />
                </LineChart>
              </ChartContainer>
            </div>
          </CardContent>
        </Card>

        <Card className='lg:col-span-1'>
          <CardHeader className='flex flex-row items-start justify-between'>
            <div>
              <CardTitle>Health Status</CardTitle>
              <CardDescription>Status and last heartbeat</CardDescription>
            </div>
            <Button
              variant='outline'
              size='icon'
              aria-label='Refresh health'
              onClick={refreshHealth}
            >
              {/* Refresh icon */}
              <svg
                xmlns='http://www.w3.org/2000/svg'
                viewBox='0 0 24 24'
                fill='none'
                stroke='currentColor'
                strokeWidth='2'
                strokeLinecap='round'
                strokeLinejoin='round'
                className='size-4'
              >
                <path d='M21 12a9 9 0 1 1-3-6.7' />
                <path d='M21 3v7h-7' />
              </svg>
            </Button>
          </CardHeader>
          <CardContent>
            <div className='grid grid-cols-1 sm:grid-cols-2 gap-4'>
              <div>
                <div className='text-xs text-muted-foreground'>Status</div>
                {health?.status !== "Lock" ? (
                  <div className='mt-1 font-bold text-red-600'>
                    {health?.status ?? "-"}
                  </div>
                ) : (
                  <div className='mt-1 font-medium'>
                    {health?.status ?? "-"}
                  </div>
                )}
              </div>
              <div>
                <div className='text-xs text-muted-foreground'>
                  Last Heartbeat
                </div>
                <div className='mt-1 font-medium'>
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
