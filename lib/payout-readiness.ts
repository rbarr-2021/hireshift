import type { WorkerProfileRecord } from "@/lib/models";

export function isWorkerPayoutReady(workerProfile: WorkerProfileRecord | null | undefined) {
  return Boolean(
    workerProfile?.stripe_connect_account_id &&
      workerProfile.stripe_connect_charges_enabled &&
      workerProfile.stripe_connect_payouts_enabled,
  );
}
