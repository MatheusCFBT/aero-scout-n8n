import { booleanCondition } from "./builder.mjs";
import { pageFields, cardFields, htmlExtraction } from "./selectors.mjs";

function requestParameters(settings) {
  return {
    url: "={{ $json.url }}",
    sendHeaders: true,
    headerParameters: {
      parameters: [
        { name: "User-Agent", value: settings.userAgent },
        { name: "Accept-Language", value: settings.acceptLanguage },
      ],
    },
    options: {
      timeout: settings.requestTimeoutMs,
      response: {
        response: {
          responseFormat: "text",
          outputPropertyName: "data",
          fullResponse: true,
          neverError: true,
        },
      },
      batching: { batch: { batchSize: 1, batchInterval: 1000 } },
    },
  };
}

/** One child execution receives exactly one category/origin query. No duplicated category branch. */
export function addSearchBranch(builder, settings) {
  const { addNode, addCodeNode, connect } = builder;
  addNode("Receber consulta", "executeWorkflowTrigger", { inputSource: "passthrough" }, [0, 0]);
  addCodeNode("Iniciar tentativa", "startAttempt", [240, 0]);
  addNode("Consultar Google Flights", "httpRequest", requestParameters(settings), [480, 0], {
    onError: "continueRegularOutput",
  });
  addCodeNode("Ler resposta", "readResponse", [720, 0]);
  const retryExpression =
    "={{ $json.attempt < " + settings.maximumAttempts +
    " && ($json.error !== null || $json.statusCode === 429 || $json.statusCode >= 500) }}";
  addNode("Repetir consulta?", "if", booleanCondition("retry", retryExpression), [960, 0]);
  addNode("Aguardar nova tentativa", "wait", {
    amount: settings.retryDelaySeconds,
    unit: "seconds",
  }, [720, -200]);
  addNode("Extrair página", "html", htmlExtraction(pageFields), [1200, 0]);
  addCodeNode("Separar cards", "splitCards", [1440, 0]);
  addNode("Extrair ofertas", "html", htmlExtraction(cardFields), [1680, 0]);
  addCodeNode("Retornar ofertas", "collectOffers", [1920, 0]);

  connect("Receber consulta", "Iniciar tentativa");
  connect("Iniciar tentativa", "Consultar Google Flights");
  connect("Consultar Google Flights", "Ler resposta");
  connect("Ler resposta", "Repetir consulta?");
  connect("Repetir consulta?", "Aguardar nova tentativa", 0);
  connect("Aguardar nova tentativa", "Iniciar tentativa");
  connect("Repetir consulta?", "Extrair página", 1);
  connect("Extrair página", "Separar cards");
  connect("Separar cards", "Extrair ofertas");
  connect("Extrair ofertas", "Retornar ofertas");
}
