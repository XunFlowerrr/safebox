import { NextResponse } from "next/server";

export type Health = {
  status: "OK" | "WARN" | "ERROR";
  lastHeartbeat: string; // ISO timestamp
};

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:3001";

export async function GET() {
  try {
    const response = await fetch(`${BACKEND_URL}/api/health`);

    if (!response.ok) {
      throw new Error(`Backend returned ${response.status}`);
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    // Fallback to error status if backend is unreachable
    return NextResponse.json(
      {
        status: "ERROR",
        lastHeartbeat: new Date().toISOString(),
      } as Health,
      { status: 500 }
    );
  }
}
