"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  RefreshCw,
  Search,
  Download,
  Database,
  BarChart3,
  LineChart as LineChartIcon,
} from "lucide-react";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
} from "@/components/ui/chart";
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";

type SortDirection = "asc" | "desc";

interface DataRecord {
  id?: string;
  timestamp: string;
  [key: string]: any;
}

interface QueryParams {
  measurement: string;
  limit: number;
  offset: number;
  sortField: string;
  sortDirection: SortDirection;
  startTime?: string;
  endTime?: string;
  filters?: Record<string, string>;
}

export default function DataExplorerPage() {
  const [activeTab, setActiveTab] = useState("sensor_data");
  const [data, setData] = useState<DataRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [totalCount, setTotalCount] = useState(0);

  // Query parameters
  const [limit, setLimit] = useState(50);
  const [offset, setOffset] = useState(0);
  const [sortField, setSortField] = useState("timestamp");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [searchFilter, setSearchFilter] = useState("");
  const [sensorTypeFilter, setSensorTypeFilter] = useState("all");
  const [eventTypeFilter, setEventTypeFilter] = useState("all");
  const [showChart, setShowChart] = useState(true);

  const measurements = [
    { value: "sensor_data", label: "Sensor Data" },
    { value: "safe_status", label: "Safe Status" },
    { value: "rotation_data", label: "Rotation Data" },
    { value: "event_log", label: "Event Logs" },
  ];

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        measurement: activeTab,
        limit: limit.toString(),
        offset: offset.toString(),
        sortField,
        sortDirection,
      });

      if (startTime) params.append("startTime", startTime);
      if (endTime) params.append("endTime", endTime);
      if (searchFilter) params.append("search", searchFilter);
      if (sensorTypeFilter !== "all")
        params.append("sensorType", sensorTypeFilter);
      if (eventTypeFilter !== "all")
        params.append("eventType", eventTypeFilter);

      const res = await fetch(`/api/explorer?${params}`);
      const result = await res.json();

      if (result.success) {
        setData(result.data);
        setTotalCount(result.total || result.data.length);
      }
    } catch (error) {
      console.error("Failed to fetch data:", error);
    } finally {
      setLoading(false);
    }
  }, [
    activeTab,
    limit,
    offset,
    sortField,
    sortDirection,
    startTime,
    endTime,
    searchFilter,
    sensorTypeFilter,
    eventTypeFilter,
  ]);

  useEffect(() => {
    setOffset(0); // Reset pagination when tab changes
    fetchData();
  }, [activeTab]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("desc");
    }
  };

  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleString();
  };

  const formatValue = (value: any) => {
    if (value === null || value === undefined) return "-";
    if (typeof value === "number") return value.toFixed(2);
    return String(value);
  };

  const SortIcon = ({ field }: { field: string }) => {
    if (sortField !== field) return <ArrowUpDown className="h-4 w-4 ml-1" />;
    return sortDirection === "asc" ? (
      <ArrowUp className="h-4 w-4 ml-1" />
    ) : (
      <ArrowDown className="h-4 w-4 ml-1" />
    );
  };

  const exportData = () => {
    const csv = [
      Object.keys(data[0] || {}).join(","),
      ...data.map((row) => Object.values(row).join(",")),
    ].join("\n");

    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${activeTab}_export_${new Date().toISOString()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const getColumns = () => {
    switch (activeTab) {
      case "sensor_data":
        return ["timestamp", "sensorType", "value", "unit", "safeId"];
      case "safe_status":
        return ["timestamp", "status", "safeId"];
      case "rotation_data":
        return ["timestamp", "alpha", "beta", "gamma", "safeId"];
      case "event_log":
        return ["timestamp", "type", "content", "severity", "safeId"];
      default:
        return ["timestamp"];
    }
  };

  const totalPages = Math.ceil(totalCount / limit);
  const currentPage = Math.floor(offset / limit) + 1;

  // Prepare chart data based on active tab
  const getChartData = () => {
    if (data.length === 0) return [];

    // Sort data by timestamp ascending for charts
    const sortedData = [...data].sort(
      (a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    return sortedData.map((item) => ({
      ...item,
      time: new Date(item.timestamp).toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      }),
      date: new Date(item.timestamp).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      }),
    }));
  };

  const chartData = getChartData();

  // Aggregate event data for bar chart
  const getEventAggregation = () => {
    const counts: Record<string, number> = {};
    data.forEach((item) => {
      const key = item.type || item.status || "Unknown";
      counts[key] = (counts[key] || 0) + 1;
    });
    return Object.entries(counts).map(([name, count]) => ({ name, count }));
  };

  const renderChart = () => {
    if (data.length === 0) {
      return (
        <div className="h-64 flex items-center justify-center text-muted-foreground">
          No data to visualize
        </div>
      );
    }

    switch (activeTab) {
      case "sensor_data":
        // Group by sensor type for multi-line chart
        const sensorTypes = [
          ...new Set(data.map((d) => d.sensorType).filter(Boolean)),
        ];
        const groupedData: Record<string, Record<string, any>> = {};

        chartData.forEach((item: any) => {
          if (!item.sensorType) return;
          const key = `${item.date} ${item.time}`;
          if (!groupedData[key]) {
            groupedData[key] = { time: item.time, date: item.date };
          }
          groupedData[key][item.sensorType] = item.value;
        });

        const sensorChartData = Object.values(groupedData);
        const sensorColors = [
          "#3b82f6",
          "#22c55e",
          "#f97316",
          "#a855f7",
          "#ef4444",
        ];
        const sensorConfig: Record<string, { label: string; color: string }> =
          {};
        sensorTypes.forEach((type, idx) => {
          if (type) {
            sensorConfig[type] = {
              label: type.charAt(0).toUpperCase() + type.slice(1),
              color: sensorColors[idx % sensorColors.length],
            };
          }
        });

        return (
          <ChartContainer config={sensorConfig} className="h-64 w-full">
            <LineChart
              data={sensorChartData}
              margin={{ left: 8, right: 8, top: 10, bottom: 10 }}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="time"
                tick={{ fontSize: 10 }}
                interval="preserveStartEnd"
              />
              <YAxis width={50} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <ChartLegend content={<ChartLegendContent />} />
              {sensorTypes.filter(Boolean).map((type, idx) => (
                <Line
                  key={type}
                  type="monotone"
                  dataKey={type}
                  stroke={sensorColors[idx % sensorColors.length]}
                  strokeWidth={2}
                  dot={{
                    r: 4,
                    fill: sensorColors[idx % sensorColors.length],
                    strokeWidth: 0,
                  }}
                  activeDot={{
                    r: 6,
                    fill: sensorColors[idx % sensorColors.length],
                  }}
                  isAnimationActive={false}
                  name={type}
                />
              ))}
              {sensorTypes.includes("vibration") && (
                <ReferenceLine
                  y={3000}
                  stroke="red"
                  strokeDasharray="5 5"
                  label={{ value: "Alert", position: "right", fontSize: 10 }}
                />
              )}
            </LineChart>
          </ChartContainer>
        );

      case "rotation_data":
        const rotationConfig = {
          alpha: { label: "Alpha (°)", color: "#3b82f6" }, // Blue
          beta: { label: "Beta (°)", color: "#22c55e" }, // Green
          gamma: { label: "Gamma (°)", color: "#f97316" }, // Orange
        };
        return (
          <ChartContainer config={rotationConfig} className="h-64 w-full">
            <LineChart
              data={chartData}
              margin={{ left: 8, right: 8, top: 10, bottom: 10 }}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="time"
                tick={{ fontSize: 10 }}
                interval="preserveStartEnd"
              />
              <YAxis width={50} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <ChartLegend content={<ChartLegendContent />} />
              <Line
                type="monotone"
                dataKey="alpha"
                stroke="#3b82f6"
                strokeWidth={2}
                dot={{ r: 4, fill: "#3b82f6", strokeWidth: 0 }}
                activeDot={{ r: 6, fill: "#3b82f6" }}
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="beta"
                stroke="#22c55e"
                strokeWidth={2}
                dot={{ r: 4, fill: "#22c55e", strokeWidth: 0 }}
                activeDot={{ r: 6, fill: "#22c55e" }}
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="gamma"
                stroke="#f97316"
                strokeWidth={2}
                dot={{ r: 4, fill: "#f97316", strokeWidth: 0 }}
                activeDot={{ r: 6, fill: "#f97316" }}
                isAnimationActive={false}
              />
            </LineChart>
          </ChartContainer>
        );

      case "safe_status":
      case "event_log":
        const aggregatedData = getEventAggregation();
        const barConfig = {
          count: { label: "Count", color: "hsl(var(--primary))" },
        };
        return (
          <ChartContainer config={barConfig} className="h-64 w-full">
            <BarChart data={aggregatedData} margin={{ left: 8, right: 8 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} />
              <YAxis width={40} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="count" fill="hsl(var(--primary))" radius={4} />
            </BarChart>
          </ChartContainer>
        );

      default:
        return null;
    }
  };

  return (
    <div className="font-sans min-h-screen p-6 md:p-10 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/">
            <Button variant="outline" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-semibold flex items-center gap-2">
              <Database className="h-6 w-6" />
              Data Explorer
            </h1>
            <p className="text-sm text-muted-foreground">
              Browse, filter, and export all data from InfluxDB
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={fetchData} disabled={loading}>
            <RefreshCw
              className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>
          <Button
            variant="outline"
            onClick={exportData}
            disabled={data.length === 0}
          >
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          {measurements.map((m) => (
            <TabsTrigger key={m.value} value={m.value}>
              {m.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* Filters */}
        <Card className="mt-4">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Filters</CardTitle>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setStartTime("");
                    setEndTime("");
                    setSearchFilter("");
                    setSensorTypeFilter("all");
                    setEventTypeFilter("all");
                    setOffset(0);
                  }}
                >
                  Clear
                </Button>
                <Button size="sm" onClick={fetchData}>
                  <Search className="h-4 w-4 mr-1" />
                  Apply
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="flex flex-wrap items-end gap-4">
              {/* Time Range */}
              <div className="space-y-1.5 min-w-[180px]">
                <label className="text-xs font-medium text-muted-foreground">
                  Start Time
                </label>
                <Input
                  type="datetime-local"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="h-9"
                />
              </div>
              <div className="space-y-1.5 min-w-[180px]">
                <label className="text-xs font-medium text-muted-foreground">
                  End Time
                </label>
                <Input
                  type="datetime-local"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="h-9"
                />
              </div>

              {/* Conditional Filters */}
              {activeTab === "sensor_data" && (
                <div className="space-y-1.5 min-w-[140px]">
                  <label className="text-xs font-medium text-muted-foreground">
                    Sensor Type
                  </label>
                  <Select
                    value={sensorTypeFilter}
                    onValueChange={setSensorTypeFilter}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="All types" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Types</SelectItem>
                      <SelectItem value="tilt">Tilt</SelectItem>
                      <SelectItem value="vibration">Vibration</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              {activeTab === "event_log" && (
                <div className="space-y-1.5 min-w-[140px]">
                  <label className="text-xs font-medium text-muted-foreground">
                    Event Type
                  </label>
                  <Select
                    value={eventTypeFilter}
                    onValueChange={setEventTypeFilter}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="All types" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Types</SelectItem>
                      <SelectItem value="Hit">Hit</SelectItem>
                      <SelectItem value="Tilt">Tilt</SelectItem>
                      <SelectItem value="Abnormal tilt detected">
                        Abnormal tilt detected
                      </SelectItem>
                      <SelectItem value="Open with alarm">
                        Open with alarm
                      </SelectItem>
                      <SelectItem value="Lock">Lock</SelectItem>
                      <SelectItem value="Unlock">Unlock</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Rows per page */}
              <div className="space-y-1.5 min-w-[100px]">
                <label className="text-xs font-medium text-muted-foreground">
                  Per page
                </label>
                <Select
                  value={limit.toString()}
                  onValueChange={(v) => setLimit(parseInt(v))}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="25">25</SelectItem>
                    <SelectItem value="50">50</SelectItem>
                    <SelectItem value="100">100</SelectItem>
                    <SelectItem value="200">200</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Chart Visualization */}
        <Card className="mt-4">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <BarChart3 className="h-4 w-4" />
                  Data Visualization
                </CardTitle>
                <CardDescription>
                  {activeTab === "sensor_data" && "Sensor values over time"}
                  {activeTab === "rotation_data" &&
                    "Rotation angles (alpha, beta, gamma) over time"}
                  {activeTab === "safe_status" && "Status distribution"}
                  {activeTab === "event_log" && "Event type distribution"}
                </CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowChart(!showChart)}
              >
                {showChart ? "Hide Chart" : "Show Chart"}
              </Button>
            </div>
          </CardHeader>
          {showChart && <CardContent>{renderChart()}</CardContent>}
        </Card>

        {/* Data Table */}
        <Card className="mt-4">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">
                Results
                <Badge variant="secondary" className="ml-2">
                  {totalCount} records
                </Badge>
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[500px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    {getColumns().map((col) => (
                      <TableHead
                        key={col}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => handleSort(col)}
                      >
                        <div className="flex items-center">
                          {col.charAt(0).toUpperCase() +
                            col.slice(1).replace(/([A-Z])/g, " $1")}
                          <SortIcon field={col} />
                        </div>
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading && (
                    <TableRow>
                      <TableCell
                        colSpan={getColumns().length}
                        className="text-center py-8"
                      >
                        <RefreshCw className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                        <p className="mt-2 text-muted-foreground">
                          Loading data...
                        </p>
                      </TableCell>
                    </TableRow>
                  )}
                  {!loading && data.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={getColumns().length}
                        className="text-center py-8 text-muted-foreground"
                      >
                        No data found
                      </TableCell>
                    </TableRow>
                  )}
                  {!loading &&
                    data.map((row, idx) => (
                      <TableRow key={idx}>
                        {getColumns().map((col) => (
                          <TableCell key={col}>
                            {col === "timestamp"
                              ? formatTimestamp(row[col])
                              : formatValue(row[col])}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </ScrollArea>

            {/* Pagination */}
            <div className="flex items-center justify-between mt-4 pt-4 border-t">
              <p className="text-sm text-muted-foreground">
                Showing {offset + 1} to {Math.min(offset + limit, totalCount)}{" "}
                of {totalCount} results
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={offset === 0}
                  onClick={() => setOffset(Math.max(0, offset - limit))}
                >
                  Previous
                </Button>
                <span className="text-sm text-muted-foreground">
                  Page {currentPage} of {totalPages || 1}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={offset + limit >= totalCount}
                  onClick={() => setOffset(offset + limit)}
                >
                  Next
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </Tabs>
    </div>
  );
}
