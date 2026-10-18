export function createPriceHelpers({ text }) {
  function priceCents(value) {
    const normalizedPrice = text.normalize(value);
    const match = normalizedPrice.match(
      /^R\$\s*((?:\d{1,3}(?:\.\d{3})+|\d+))(?:,(\d{2}))?$/,
    );
    if (!match) {
      throw Error("Preço em BRL não reconhecido");
    }

    const reais = Number(match[1].replace(/\./g, ""));
    const cents = Number(match[2] || 0);
    const totalCents = reais * 100 + cents;
    if (!Number.isSafeInteger(totalCents) || totalCents <= 0) {
      throw Error("Preço inválido");
    }
    return totalCents;
  }

  return { priceCents };
}
