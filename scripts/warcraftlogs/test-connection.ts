import { WarcraftLogsProvider } from "../../src/providers/warcraftlogs/WarcraftLogsProvider";

const wcl = new WarcraftLogsProvider();
const rateLimitData = await wcl.fetchRateLimitData();

console.log("Conexão OK com a API v2 do WarcraftLogs.");
console.log(rateLimitData);
