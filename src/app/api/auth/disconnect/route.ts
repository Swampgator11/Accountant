import { NextResponse } from "next/server";
import { disconnectQuickBooks } from "@/lib/qbo/oauth";

export async function POST() {
  await disconnectQuickBooks();
  return NextResponse.json({ ok: true });
}
