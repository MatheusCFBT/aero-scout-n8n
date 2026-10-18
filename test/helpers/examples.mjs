export function flightLink(departure = "2026-12-28", returnDate = "2027-01-04") {
  const bytes = Buffer.from([
    0x1a, 12, 0x12, 10, ...Buffer.from(departure),
    0x1a, 12, 0x12, 10, ...Buffer.from(returnDate),
  ]);
  return "https://www.google.com/travel/flights?tfs=" + bytes.toString("base64url");
}

export const context = {
  category: "nacionais",
  origin: "GRU",
  searchedAt: "2026-10-17T12:00:00Z",
  today: "2026-10-17",
  horizonMonths: 6,
};

export function card(overrides = {}) {
  return {
    destination: "Recife",
    country: "Brasil",
    price: "R$ 1.234,56",
    discountLabel: "25% abaixo da média",
    referencePrice: "R$ 1.646,08",
    details: "GRU–REC",
    link: flightLink(),
    ...overrides,
  };
}
