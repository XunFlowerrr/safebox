import { NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:3001";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const safeId = searchParams.get("safeId");
    const limit = searchParams.get("limit") || "50";

    // Build query string for backend
    const queryParams = new URLSearchParams();
    if (safeId) queryParams.append("safeId", safeId);
    queryParams.append("limit", limit);

    const response = await fetch(`${BACKEND_URL}/api/logs?${queryParams}`);

    if (!response.ok) {
      throw new Error(`Backend returned ${response.status}`);
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    // Fallback to mock data if backend is unreachable
    return NextResponse.json({ logs: [] }); // Empty logs
  }
}
