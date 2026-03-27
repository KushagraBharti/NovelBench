const SHORT_DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "numeric",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "numeric",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  second: "2-digit",
  hour12: true,
  timeZone: "UTC",
});

export function formatShortDate(dateLike: string | number | Date) {
  return SHORT_DATE_FORMATTER.format(new Date(dateLike));
}

export function formatDateTime(dateLike: string | number | Date) {
  return DATE_TIME_FORMATTER.format(new Date(dateLike));
}
