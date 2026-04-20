const PLATFORM_FEE_BASIS_POINTS = 1500;

function roundCurrency(value: number) {
  return Number(value.toFixed(2));
}

export function getPlatformFeeBasisPoints() {
  return PLATFORM_FEE_BASIS_POINTS;
}

export function calculatePlatformFee(workerSubtotalGbp: number) {
  if (!Number.isFinite(workerSubtotalGbp) || workerSubtotalGbp <= 0) {
    return 0;
  }

  return roundCurrency(
    (workerSubtotalGbp * getPlatformFeeBasisPoints()) / 10_000,
  );
}

export function calculateBusinessTotal(workerSubtotalGbp: number, platformFeeGbp: number) {
  return roundCurrency(Math.max(workerSubtotalGbp, 0) + Math.max(platformFeeGbp, 0));
}

export function buildBookingPricingSnapshot(workerSubtotalGbp: number) {
  const workerPayGbp = roundCurrency(Math.max(workerSubtotalGbp, 0));
  const platformFeeGbp = calculatePlatformFee(workerPayGbp);
  const businessTotalGbp = calculateBusinessTotal(workerPayGbp, platformFeeGbp);

  return {
    workerPayGbp,
    platformFeeGbp,
    businessTotalGbp,
  };
}

