// Extract every value inside its own Google Flights card.
export const pageFields = [
  { key: "cards", cssSelector: "[data-deal-card-index]", returnValue: "html", returnArray: true },
  { key: "headings", cssSelector: "h2", returnArray: true },
  { key: "bodyText", cssSelector: "body", skipSelectors: "script,style" },
  { key: "tripType", cssSelector: '[aria-label$="Tipo de passagem"]' },
  { key: "cabin", cssSelector: '[aria-label$="Classe do assento"]' },
  {
    key: "passengers", cssSelector: '[aria-label="1 passageiro"]',
    returnValue: "attribute", attribute: "aria-label",
  },
  {
    key: "currency", cssSelector: '[aria-label="Moeda BRL"]',
    returnValue: "attribute", attribute: "aria-label",
  },
  {
    key: "originLabel", cssSelector: 'input[role="combobox"]',
    returnValue: "attribute", attribute: "aria-label",
  },
];

export const cardFields = [
  { key: "destination", cssSelector: ".BkHwyb" },
  { key: "country", cssSelector: ".ViT5Db" },
  { key: "price", cssSelector: ".Z96dGf" },
  { key: "discountLabel", cssSelector: ".O1Ixyf" },
  { key: "referencePrice", cssSelector: ".PKGYsd span[aria-label]" },
  { key: "details", cssSelector: ".Rha8Ed .lT3Wff", returnArray: true },
  { key: "link", cssSelector: "a", returnValue: "attribute", attribute: "href" },
];

export function htmlExtraction(values) {
  return {
    operation: "extractHtmlContent",
    dataPropertyName: "data",
    extractionValues: { values },
    options: { trimValues: true, cleanUpText: true },
  };
}
