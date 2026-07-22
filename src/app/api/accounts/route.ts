import { NextResponse } from "next/server";
import { listExpenseAccounts } from "@/lib/qbo/client";

export async function GET() {
  try {
    const accounts = await listExpenseAccounts();
    return NextResponse.json({ accounts });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load accounts" },
      { status: 500 },
    );
  }
}
