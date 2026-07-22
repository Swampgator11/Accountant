import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { applyCategory, listTransactions } from "@/lib/qbo/client";
import { getConfig } from "@/lib/config";

const bodySchema = z.object({
  items: z
    .array(
      z.object({
        transactionId: z.string(),
        accountId: z.string(),
        accountName: z.string(),
      }),
    )
    .min(1),
});

export async function POST(request: NextRequest) {
  try {
    const config = getConfig();
    const json = await request.json();
    const body = bodySchema.parse(json);
    const transactions = await listTransactions();
    const byId = new Map(transactions.map((t) => [t.id, t]));

    const results: Array<{ transactionId: string; ok: boolean; error?: string }> =
      [];

    for (const item of body.items) {
      const txn = byId.get(item.transactionId);
      if (!txn) {
        results.push({
          transactionId: item.transactionId,
          ok: false,
          error: "Transaction not found",
        });
        continue;
      }

      try {
        await applyCategory({
          transactionId: txn.id,
          source: txn.source,
          accountId: item.accountId,
          accountName: item.accountName,
        });
        results.push({
          transactionId: item.transactionId,
          ok: true,
          error:
            txn.source === "Demo" || config.DEMO_MODE
              ? "Preview only in demo mode — connect QuickBooks to write categories"
              : undefined,
        });
      } catch (error) {
        results.push({
          transactionId: item.transactionId,
          ok: false,
          error: error instanceof Error ? error.message : "Apply failed",
        });
      }
    }

    return NextResponse.json({ results });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to apply categories",
      },
      { status: 400 },
    );
  }
}
