import { NextResponse } from "next/server"

// Mock log entries following the provided structure: [{ type, content }]
const MOCK_LOGS: Array<{ type: string; content: string }> = [
  { type: "Hit", content: "Impact detected on front panel." },
  { type: "Tilt", content: "Box tilted beyond 30° on Y-axis." },
  { type: "Open with alarm", content: "Lid opened while armed. Siren triggered." },
  { type: "Open", content: "Lid opened while disarmed." },
  { type: "Vibration", content: "High vibration level detected (8.2)." },
  { type: "Temperature", content: "Temperature rose to 35.4°C." },
  { type: "Hit", content: "Strong impact detected on right side." },
  { type: "Tilt", content: "Box tilted back to safe range." },
  { type: "Battery", content: "Battery level low: 18%." },
  { type: "Arm", content: "System armed by user." },
  { type: "Disarm", content: "System disarmed by user." },
  { type: "Open with alarm", content: "Unauthorized access attempt detected." },
  { type: "Network", content: "Device reconnected to Wi‑Fi." },
  { type: "Firmware", content: "Firmware update completed successfully." },
]

export async function GET() {
  // In a real implementation, fetch from your backend here.
  return NextResponse.json(MOCK_LOGS)
}
