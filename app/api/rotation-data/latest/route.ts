export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const safeId = searchParams.get('safeId') || 'safe-001';
  const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:3001";
  try {
    const response = await fetch(`${BACKEND_URL}/api/rotation-data/latest?safeId=${safeId}`);
    const data = await response.json();
    return Response.json(data);
  } catch (error) {
    return Response.json({ success: false, error: 'Failed to fetch rotation data' }, { status: 500 });
  }
}
