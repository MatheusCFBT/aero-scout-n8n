export function createOfferRanking({ text, settings }) {
  function compareOffers(first, second) {
    return (
      second.discountPercent - first.discountPercent ||
      first.priceCents - second.priceCents ||
      first.destination.localeCompare(second.destination, "pt-BR") ||
      first.departure.localeCompare(second.departure) ||
      first.origin.localeCompare(second.origin)
    );
  }

  /** @param {import("../types.mjs").Offer[]} offers */
  function rank(offers, limit = settings.offerLimit) {
    const sorted = offers
      .filter((offer) => Number.isFinite(offer.discountPercent) &&
        offer.discountPercent > 0 && offer.discountPercent < 100)
      .sort(compareOffers);
    const seenDestinations = new Set();
    return sorted
      .filter((offer) => {
        const destinationKey =
          text.normalize(offer.destination).toLocaleLowerCase("pt-BR") + "|" + offer.country;
        if (seenDestinations.has(destinationKey)) {
          return false;
        }
        seenDestinations.add(destinationKey);
        return true;
      })
      .slice(0, limit);
  }

  return { rank };
}
