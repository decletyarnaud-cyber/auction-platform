export function formatCurrency(
  value: number | null | undefined,
  locale: string = "fr-FR",
  currency: string = "EUR"
): string {
  if (value == null) return "-";
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatNumber(
  value: number | null | undefined,
  locale: string = "fr-FR"
): string {
  if (value == null) return "-";
  return new Intl.NumberFormat(locale).format(value);
}

export function formatDate(
  date: string | Date | null | undefined,
  locale: string = "fr-FR",
  options?: Intl.DateTimeFormatOptions
): string {
  if (!date) return "-";
  const d = typeof date === "string" ? new Date(date) : date;
  // Check for invalid date
  if (isNaN(d.getTime())) return "-";
  return d.toLocaleDateString(locale, options ?? {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function formatPercent(
  value: number | null | undefined,
  decimals: number = 0
): string {
  if (value == null) return "-";
  return `${value >= 0 ? "-" : "+"}${Math.abs(value).toFixed(decimals)}%`;
}

export function formatSurface(
  value: number | null | undefined,
  locale: string = "fr-FR"
): string {
  if (value == null) return "-";
  return `${new Intl.NumberFormat(locale).format(value)} m²`;
}

export function formatMileage(
  value: number | null | undefined,
  locale: string = "fr-FR"
): string {
  if (value == null) return "-";
  return `${new Intl.NumberFormat(locale).format(value)} km`;
}
