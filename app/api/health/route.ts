import { NextResponse } from "next/server"

export type Health = {
  status: "OK" | "WARN" | "ERROR"
  lastHeartbeat: string // ISO timestamp
}

function mockHealth(): Health {
  const now = new Date()
  const minutes = now.getMinutes()
  const status: Health["status"] = minutes % 15 === 0 ? "WARN" : "OK"
  return {
    status,
    lastHeartbeat: new Date(now.getTime() - (minutes % 5) * 60_000).toISOString(),
  }
}

export async function GET() {
  return NextResponse.json(mockHealth())
}
