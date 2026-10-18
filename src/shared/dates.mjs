export function createDateHelpers() {
  const MILLISECONDS_PER_DAY = 86_400_000;

  function day(isoDate) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) {
      throw Error("Data inválida");
    }

    const timestamp = Date.parse(isoDate + "T00:00:00Z");
    const isValid =
      Number.isFinite(timestamp) &&
      new Date(timestamp).toISOString().slice(0, 10) === isoDate;

    if (!isValid) {
      throw Error("Data inválida");
    }
    return timestamp;
  }

  function addMonths(isoDate, months) {
    const date = new Date(day(isoDate));
    const originalDay = date.getUTCDate();
    date.setUTCDate(1);
    date.setUTCMonth(date.getUTCMonth() + months);

    const lastDayOfMonth = new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0),
    ).getUTCDate();
    date.setUTCDate(Math.min(originalDay, lastDayOfMonth));
    return date.toISOString().slice(0, 10);
  }

  function tripDuration(departure, returnDate) {
    return (day(returnDate) - day(departure)) / MILLISECONDS_PER_DAY;
  }

  return { day, addMonths, tripDuration };
}
