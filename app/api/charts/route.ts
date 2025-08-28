import { NextResponse } from "next/server"

type SensorPoint = { t: string; tilt: number; vib: number }

function generateSeries(points = 24): SensorPoint[] {
  const series: SensorPoint[] = []
  for (let i = 0; i < points; i++) {
    // Mock tilt in degrees (0°–45°) with occasional spikes
    const base = 10 + Math.abs(Math.sin(i / 3)) * 15
    const spike = i % 7 === 0 ? 12 : 0
    const tilt = Math.min(45, Number((base + spike).toFixed(1)))
    const vib = Math.max(0, Math.round(2 + Math.cos(i / 2) * 1.5 + (i % 5 === 0 ? 3 : 0)))
    series.push({ t: `${i}:00`, tilt, vib })
  }
  return series
}

export async function GET() {
  // In a real implementation, you would query your time-series storage
  // and return the latest buckets here.
  const series = generateSeries(24)
  return NextResponse.json(series)
}
