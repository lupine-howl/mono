import { toolRegistry as rpc } from "@loki/minihttp/util";

export const dbUpdate = (params) => rpc.$call("dbUpdate", params);
export const dbInsert = (params) => rpc.$call("dbInsert", params);
export const dbDelete = (params) => rpc.$call("dbDelete", params);
export const dbSelect = (params) => rpc.$call("dbSelect", params);
export const dbListTables = () => rpc.$call("dbListTables", {});
export const dbGetSchema = () => rpc.$call("dbGetSchema", {});
