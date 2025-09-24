import { call } from "@loki/minihttp/util";

export const dbUpdate = (params) => call("dbUpdate", params);
export const dbInsert = (params) => call("dbInsert", params);
export const dbDelete = (params) => call("dbDelete", params);
export const dbSelect = (params) => call("dbSelect", params);
export const dbListTables = () => call("dbListTables", {});
export const dbGetSchema = () => call("dbGetSchema", {});
