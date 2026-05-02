import { NextRequest } from "next/server";
import { POST as refreshPayoutStatus } from "@/app/api/worker/payout-account/refresh/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  return refreshPayoutStatus(request);
}
