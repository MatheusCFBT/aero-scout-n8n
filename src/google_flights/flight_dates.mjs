export function createFlightDateParser({ protocol, dates }) {
  function readLegDate(leg) {
    const dateFields = protocol.fields(leg.data).filter(({ key }) => key === protocol.tags.DATE);
    if (dateFields.length !== 1) {
      throw Error("Data ambígua");
    }
    const isoDate = dateFields[0].data.toString("utf8");
    dates.day(isoDate);
    return isoDate;
  }

  function flightDates(url) {
    const encodedQuery = url.match(/[?&]tfs=([^&]+)/)?.[1];
    if (!encodedQuery) {
      throw Error("Link sem datas verificáveis");
    }
    const queryBytes = Buffer.from(decodeURIComponent(encodedQuery), "base64url");
    const legs = protocol.fields(queryBytes).filter(({ key }) => key === protocol.tags.FLIGHT_LEG);
    if (legs.length !== 2) {
      throw Error("Oferta não comprova ida e volta");
    }
    return legs.map(readLegDate);
  }

  return { flightDates };
}
