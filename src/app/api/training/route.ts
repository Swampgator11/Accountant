import { NextResponse } from "next/server";
import { trainFromHistory } from "@/lib/categorization/trainer";
import { listTransactions } from "@/lib/qbo/client";
import { getTrainingModel, saveTrainingModel } from "@/lib/storage/store";

const HISTORY_START = "2023-01-01";

export async function GET() {
  try {
    const model = await getTrainingModel();
    return NextResponse.json({ model });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to load training model",
      },
      { status: 500 },
    );
  }
}

/** Retrain from already-categorized QuickBooks history. */
export async function POST() {
  try {
    const all = await listTransactions({ startDate: HISTORY_START });
    const history = all.filter((t) => !t.isUncategorized);
    const model = trainFromHistory(history, {
      historyStartDate: HISTORY_START,
      historyEndDate: new Date().toISOString().slice(0, 10),
    });
    await saveTrainingModel(model);

    return NextResponse.json({
      model,
      message: `Trained on ${model.categorizedCount} past entries → ${model.patternCount} patterns.`,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to train from QuickBooks history",
      },
      { status: 500 },
    );
  }
}
