import { app } from "./app.js";
import { ENV } from "./config/env.js";

app.listen(ENV.PORT, ENV.HOST, () => {
  console.log(`MCP Server running at http://${ENV.HOST}:${ENV.PORT}`);
});
