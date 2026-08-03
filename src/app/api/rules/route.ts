import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createDefaultRules } from "@/lib/categorization/engine";
import { listExpenseAccounts } from "@/lib/qbo/client";
import { getRules, saveRules } from "@/lib/storage/store";

const ruleSchema = z.object({
  id: z.string(),
  label: z.string().min(1),
  pattern: z.string().min(1),
  matchField: z.enum(["description", "vendor", "any"]),
  accountId: z.string().min(1),
  accountName: z.string().min(1),
  priority: z.number(),
  enabled: z.boolean(),
});

export async function GET() {
  try {
    let rules = await getRules();
    if (rules.length === 0) {
      const accounts = await listExpenseAccounts();
      rules = createDefaultRules(accounts);
      await saveRules(rules);
    }
    return NextResponse.json({ rules });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load rules" },
      { status: 500 },
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const json = await request.json();
    const rules = z.array(ruleSchema).parse(json.rules);
    await saveRules(rules);
    return NextResponse.json({ rules });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to save rules" },
      { status: 400 },
    );
  }
}
