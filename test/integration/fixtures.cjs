// External-service simulations only. Application parsers, queries and nodes remain real.
function flightLink() {
  const leg = date => [26, 12, 18, 10, ...Buffer.from(date)];
  return '/travel/flights?tfs=' + Buffer.from([
    ...leg('2027-01-01'), ...leg('2027-01-08'),
  ]).toString('base64url');
}

function card(destination, country, airport, origin, discount, price, dates) {
  const leg = date => [26, 12, 18, 10, ...Buffer.from(date)];
  const link = dates ? '/travel/flights?tfs=' + Buffer.from(dates.flatMap(leg)).toString('base64url') : flightLink();
  return `<div data-deal-card-index="0"><span class="BkHwyb">${destination}</span>
    <span class="ViT5Db">${country}</span><span class="Z96dGf">R$ ${price}</span>
    <span class="O1Ixyf">${discount}% abaixo da média</span>
    <div class="Rha8Ed"><span class="lT3Wff">${origin}–${airport}</span></div>
    <a href="${link}">Consultar</a></div>`;
}

function page({ category, origin }, scenario) {
  let cards = [];
  const dates = scenario === 'command' || scenario === 'restart' ? ['2027-05-14', '2027-05-18'] : null;
  if (scenario !== 'empty') {
    if (category === 'nacionais') {
      cards = origin === 'GRU'
        ? [card('Recife', 'Brasil', 'REC', origin, 30, '500', dates), card('Natal', 'Brasil', 'NAT', origin, 40, '700', dates)]
        : [card('Recife', 'Brasil', 'REC', origin, 35, '600', dates), card('Maceió', 'Brasil', 'MCZ', origin, 20, '400', dates)];
    } else {
      cards = [card('Lisboa', 'Portugal', 'LIS', origin, origin === 'GRU' ? 25 : 30, '2.100', dates)];
    }
  }
  if (scenario === 'command' && category === 'nacionais' && origin === 'GRU') {
    cards.push(card('Salvador', 'Brasil', 'SSA', origin, 90, '300', ['2027-05-21', '2027-05-24']));
  }
  const period = dates ? '1–6 dias com ida entre 14 de mai. e 19 de mai.' : '3–14 dias nos próximos 6 meses';
  return `<html><body><input role="combobox" aria-label="Cidade ou aeroporto ${origin}">
    <button aria-label="Ida e volta, Tipo de passagem">Ida e volta</button>
    <button aria-label="Econômica, Classe do assento">Econômica</button>
    <button aria-label="1 passageiro">1</button><button aria-label="Moeda BRL">BRL</button>
    <h2>${cards.length} ofertas saindo de ${origin} para uma viagem de ${period}</h2>
    ${cards.length ? cards.join('') : '<p>Nenhuma oferta encontrada para sua pesquisa</p>'}</body></html>`;
}

module.exports = { page };
