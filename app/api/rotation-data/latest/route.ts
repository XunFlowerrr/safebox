export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const safeId = searchParams.get('safeId') || 'safe-001';

  try {
    const response = await fetch(`http://localhost:3001/api/rotation-data/latest?safeId=${safeId}`);
    const data = await response.json();
    return Response.json(data);
  } catch (error) {
    return Response.json({ success: false, error: 'Failed to fetch rotation data' }, { status: 500 });
  }
}
