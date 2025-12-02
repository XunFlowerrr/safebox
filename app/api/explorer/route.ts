import { NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:3001";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    
    // Forward all query params to the backend
    const response = await fetch(`${BACKEND_URL}/api/explorer?${searchParams.toString()}`);

    if (!response.ok) {
      throw new Error(`Backend returned ${response.status}`);
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Explorer API error:", error);
    return NextResponse.json({ 
      success: false, 
      data: [], 
      total: 0,
      error: error instanceof Error ? error.message : "Unknown error" 
    });
  }
}
