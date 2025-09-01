import { createOpenApiRpcClient } from "@loki/minihttp/util";
const rpc = createOpenApiRpcClient({
  base: typeof location !== "undefined" ? location.origin : "",
  openapiUrl: "/openapi.json",
});

export const dbUpdate = rpc.dbUpdate;
export const dbInsert = rpc.dbInsert;
export const dbDelete = rpc.dbDelete;
export const dbSelect = rpc.dbSelect;
export const dbListTables = rpc.dbListTables;
export const dbGetSchema = rpc.dbGetSchema;
