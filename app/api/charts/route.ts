import { NextResponse } from "next/server"

type SensorPoint = { t: string; temp: number; vib: number }

function generateSeries(points = 24): SensorPoint[] {
  const series: SensorPoint[] = []
  for (let i = 0; i < points; i++) {
    const temp = 24 + Math.sin(i / 3) * 3 + (i % 5 === 0 ? 1 : 0)
    const vib = Math.max(0, Math.round(2 + Math.cos(i / 2) * 1.5 + (i % 7 === 0 ? 3 : 0)))
    series.push({ t: `${i}:00`, temp: Number(temp.toFixed(1)), vib })
  }
  return series
}

export async function GET() {
  // In a real implementation, you would query your time-series storage
  // and return the latest buckets here.
  const series = generateSeries(24)
  return NextResponse.json(series)
}
