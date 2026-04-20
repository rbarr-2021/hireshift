export const CURRENT_UK_MINIMUM_HOURLY_RATE_GBP = 12.71;
export const CURRENT_UK_MINIMUM_RATE_EFFECTIVE_FROM = "2026-04-01";

export function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 2,
  }).format(value);
}

export function getUkMinimumRateMessage() {
  return `Rates must be at least ${formatCurrency(CURRENT_UK_MINIMUM_HOURLY_RATE_GBP)} per hour to match the current UK National Living Wage from ${CURRENT_UK_MINIMUM_RATE_EFFECTIVE_FROM}.`;
}

export function isBelowUkMinimumHourlyRate(value: number) {
  return value < CURRENT_UK_MINIMUM_HOURLY_RATE_GBP;
}
