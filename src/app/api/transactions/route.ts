import { NextRequest, NextResponse } from "next/server";
import { listTransactions } from "@/lib/qbo/client";

export async function GET(request: NextRequest) {
  try {
    const uncategorizedOnly =
      request.nextUrl.searchParams.get("uncategorized") === "1";
    const transactions = await listTransactions({ uncategorizedOnly });
    return NextResponse.json({ transactions });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to load transactions",
      },
      { status: 500 },
    );
  }
}
