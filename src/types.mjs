/**
 * @typedef {"nacionais" | "internacionais"} Category
 * @typedef {"complete" | "partial" | "failed"} SearchStatus
 *
 * @typedef {object} SearchContext
 * @property {"daily" | "command"} [mode]
 * @property {string} [startDate] Requested inclusive ISO window start.
 * @property {string} [endDate] Requested inclusive ISO window end.
 * @property {string} [departureEndDate] Last permitted departure, end minus one day.
 * @property {number} [minimumTripDays]
 * @property {number} [maximumTripDays]
 * @property {string} [requestId] Telegram update identifier, never a credential.
 * @property {Category} category
 * @property {string} origin
 * @property {string} searchedAt ISO timestamp.
 * @property {string} today ISO date in America/Sao_Paulo.
 * @property {number | null} horizonMonths
 * @property {number} [statusCode]
 * @property {string | null} [error]
 *
 * @typedef {object} Offer
 * @property {Category} category
 * @property {string} destination
 * @property {string} country
 * @property {string} origin
 * @property {string} destinationAirport
 * @property {string} departure ISO date.
 * @property {string} returnDate ISO date.
 * @property {number} priceCents Total round-trip price per person, in integer cents.
 * @property {number} discountPercent Percentage below typical price, reported by Google.
 * @property {number | null} referencePriceCents Google typical price, when available.
 * @property {"BRL"} currency
 * @property {string} url
 *
 * @typedef {object} SearchReport
 * @property {Category} category
 * @property {string} searchedAt
 * @property {string} today
 * @property {number | null} horizonMonths
 * @property {SearchStatus} status
 * @property {Offer[]} offers
 * @property {string[]} warnings
 *
 * @typedef {object} N8nItem
 * @property {object} json
 * @property {{item: number}} [pairedItem]
 */
export {};

/**
 * @typedef {SearchContext & {url: string, attempt?: number}} SearchQuery
 * One item passed to the query child; no credential or parent-node reference is required.
 *
 * @typedef {SearchReport & {origin: string, attempt: number}} QueryReport
 * All valid offers from one query, before cross-origin ranking and the category limit.
 *
 * @typedef {object} TelegramMessage
 * @property {Category} category
 * @property {SearchStatus} status
 * @property {string} text Final HTML, already split and ordered.
 * @property {string} chatId
 * @property {boolean} dryRun
 */
