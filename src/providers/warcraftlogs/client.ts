import "dotenv/config";

const TOKEN_URL = "https://www.warcraftlogs.com/oauth/token";
const API_URL = "https://www.warcraftlogs.com/api/v2/client";

let cachedToken: string | null = null;
let tokenExpiresAt = 0;

async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiresAt) {
    return cachedToken;
  }

  const { WCL_CLIENT_ID, WCL_CLIENT_SECRET } = process.env;
  if (!WCL_CLIENT_ID || !WCL_CLIENT_SECRET) {
    throw new Error(
      "WCL_CLIENT_ID / WCL_CLIENT_SECRET não definidos. Configure o .env na raiz do projeto (veja .env.example)."
    );
  }

  const basicAuth = Buffer.from(`${WCL_CLIENT_ID}:${WCL_CLIENT_SECRET}`).toString("base64");

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicAuth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  if (!response.ok) {
    throw new Error(`Falha ao autenticar no WarcraftLogs (${response.status}): ${await response.text()}`);
  }

  const data = (await response.json()) as { access_token: string; expires_in: number };
  cachedToken = data.access_token;
  tokenExpiresAt = Date.now() + data.expires_in * 1000 - 60_000;
  return cachedToken;
}

export async function wclGraphql<T = unknown>(
  query: string,
  variables: Record<string, unknown> = {}
): Promise<T> {
  const token = await getAccessToken();

  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
  });

  /**
   * O status HTTP vem ANTES do corpo, e por um motivo concreto.
   *
   * Sem esta checagem, estourar o limite de pontos devolvia um corpo sem
   * `data` e sem `errors`, e o script morria três chamadas adiante com
   * "Cannot read properties of undefined (reading 'worldData')" — um erro que
   * não diz nada sobre o que aconteceu e manda procurar no lugar errado.
   */
  if (!response.ok) {
    const corpo = await response.text();
    const dica =
      response.status === 429
        ? " — limite de pontos da hora estourado. Espere a hora virar; ver COLETA.md."
        : "";
    throw new Error(
      `WarcraftLogs respondeu ${response.status} ${response.statusText}${dica}\n${corpo.slice(0, 400)}`
    );
  }

  const json = (await response.json()) as { data?: T; errors?: unknown };

  if (json.errors) {
    throw new Error(`Erro GraphQL do WarcraftLogs: ${JSON.stringify(json.errors)}`);
  }

  // Resposta 200 sem `data` e sem `errors` existe: é o que a WCL devolve em
  // algumas falhas internas. Falhar aqui aponta pra chamada certa.
  if (json.data === undefined) {
    throw new Error(
      `WarcraftLogs devolveu 200 sem dados nem erros. Query: ${query.slice(0, 120).replace(/\s+/g, " ")}`
    );
  }

  return json.data;
}
