import { NextResponse } from "next/server";

type SensorPoint = { t: string; tilt: number; vib: number };

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:3001";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const safeId = searchParams.get("safeId");
    const hours = searchParams.get("hours") || "24";

    // Build query string for backend
    const queryParams = new URLSearchParams();
    if (safeId) queryParams.append("safeId", safeId);
    queryParams.append("hours", hours);

    const response = await fetch(`${BACKEND_URL}/api/charts?${queryParams}`);

    if (!response.ok) {
      throw new Error(`Backend returned ${response.status}`);
    }

    const data = await response.json();
    console.log("Fetched chart data:", data);

    return NextResponse.json(data);
  } catch (error) {
    // Fallback to mock data if backend is unreachable
    // const series = generateFallbackSeries(24);
    return NextResponse.json([]);
  }
}

function generateFallbackSeries(points = 24): SensorPoint[] {
  const series: SensorPoint[] = [];
  for (let i = 0; i < points; i++) {
    // Mock tilt in degrees (0°–45°) with occasional spikes
    const base = 10 + Math.abs(Math.sin(i / 3)) * 15;
    const spike = i % 7 === 0 ? 12 : 0;
    const tilt = Math.min(45, Number((base + spike).toFixed(1)));
    const vib = Math.max(
      0,
      Math.round(2 + Math.cos(i / 2) * 1.5 + (i % 5 === 0 ? 3 : 0))
    );
    series.push({ t: `${i}:00`, tilt, vib });
  }
  return series;
}
