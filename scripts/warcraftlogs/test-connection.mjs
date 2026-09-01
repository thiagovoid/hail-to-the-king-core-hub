import { wclGraphql } from './client.mjs';

const QUERY = `
  query {
    rateLimitData {
      limitPerHour
      pointsSpentThisHour
      pointsResetIn
    }
  }
`;

const data = await wclGraphql(QUERY);

console.log('Conexão OK com a API v2 do WarcraftLogs.');
console.log(data.rateLimitData);
