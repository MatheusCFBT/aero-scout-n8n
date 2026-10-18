export function createFlightQueries({ protocol, settings, templates, dates }) {
  function replaceOriginAndRemoveDate(leg, origin, originTag) {
    const preservedFields = protocol
      .fields(leg)
      .filter(({ key }) => key !== protocol.tags.DATE && key !== originTag)
      .map(({ raw }) => raw);
    preservedFields.push(protocol.field(originTag, protocol.airportLocation(origin)));
    return protocol.field(protocol.tags.FLIGHT_LEG, Buffer.concat(preservedFields));
  }

  function makeQuery(category, origin, context = {}) {
    if (!settings.origins.includes(origin) || !templates[category]) {
      throw Error("Pesquisa não configurada");
    }

    let legIndex = 0;
    const templateBytes = Buffer.from(templates[category].tfs, "base64url");
    const queryParts = protocol.fields(templateBytes).map(({ key, data, raw }) => {
      if (key !== protocol.tags.FLIGHT_LEG) {
        return raw;
      }
      // The requested origin is the departure location outbound and the arrival location inbound.
      const originTag = legIndex++ === 0 ? protocol.tags.ORIGIN : protocol.tags.DESTINATION;
      return replaceOriginAndRemoveDate(data, origin, originTag);
    });

    if (context.mode === "command") {
      // Encoded protobuf tags in the public Google URL: custom departure range + duration.
      const tags = {
        WINDOW: 218, WRAPPER: 10, RANGE: 18, START: 10, END: 18,
        DURATION: 42, MINIMUM: 8, MAXIMUM: 16,
      };
      const duration = dates.tripDuration(context.startDate, context.endDate);
      if (duration < 1 || duration !== context.maximumTripDays ||
          context.minimumTripDays !== 1 ||
          dates.tripDuration(context.departureEndDate, context.endDate) !== 1) {
        throw Error("Janela inválida");
      }
      for (let index = queryParts.length - 1; index >= 0; index -= 1) {
        if (protocol.fields(queryParts[index])[0].key === tags.WINDOW) {
          queryParts.splice(index, 1);
        }
      }
      const range = protocol.field(tags.RANGE, Buffer.concat([
        protocol.field(tags.START, Buffer.from(context.startDate)),
        protocol.field(tags.END, Buffer.from(context.departureEndDate)),
      ]));
      const length = protocol.field(tags.DURATION, Buffer.concat([
        protocol.integerField(tags.MINIMUM, 1),
        protocol.integerField(tags.MAXIMUM, duration),
      ]));
      queryParts.push(protocol.field(tags.WINDOW,
        protocol.field(tags.WRAPPER, Buffer.concat([range, length]))));
    }
    const encodedQuery = Buffer.concat(queryParts).toString("base64url");
    return (
      "https://www.google.com/travel/flights/deals?hl=pt-BR&gl=BR&curr=BRL&tfs=" +
      encodedQuery
    );
  }

  return { makeQuery };
}
