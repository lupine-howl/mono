// src/registry/validation.js

const PRIMS = new Set([
  "string",
  "number",
  "integer",
  "boolean",
  "null",
  "array",
  "object",
]);

// Shallow type check (no deep property validation)
function checkType(type, v, itemSchema = null) {
  switch (type) {
    case "null":
      return v === null;
    case "integer":
      return Number.isInteger(v);
    case "number":
      return typeof v === "number" && Number.isFinite(v);
    case "boolean":
      return typeof v === "boolean";
    case "string":
      return typeof v === "string";
    case "array":
      if (!Array.isArray(v)) return false;
      if (!itemSchema) return true;
      // Minimal items validation: support single-schema form (not tuple form)
      return v.every((el) => checkValueAgainstSchema(itemSchema, el));
    case "object":
      return v !== null && typeof v === "object" && !Array.isArray(v);
    default:
      // Unknown types are considered valid (stay minimal)
      return true;
  }
}

// Minimal validator for item schemas (used for array items)
function checkValueAgainstSchema(schema, value) {
  if (!schema || typeof schema !== "object") return true;

  // Enum short-circuit
  if (Array.isArray(schema.enum)) {
    return schema.enum.includes(value);
  }

  // Type handling
  const t = schema.type;

  if (Array.isArray(t) && t.length > 0) {
    // General union (e.g., ["string","number","null"])
    return t.some((tt) => checkType(tt, value, schema.items));
  }

  if (typeof t === "string" && PRIMS.has(t)) {
    if (t === "array") {
      return checkType("array", value, schema.items || null);
    }
    return checkType(t, value);
  }

  // If no explicit/known type, accept (keep it minimal)
  return true;
}

export function validate(schema, source) {
  if (!schema || schema.type !== "object")
    return { ok: true, value: source || {} };

  const props = schema.properties || {};
  const req = new Set(schema.required || []);
  const out = {};

  for (const key of Object.keys(props)) {
    const def = props[key] || {};
    let v = source?.[key];

    // Apply default if missing and default is provided
    if (v === undefined && def.hasOwnProperty("default")) {
      v = def.default;
    }

    if (v === undefined) {
      if (req.has(key)) return { ok: false, error: `Missing required: ${key}` };
      continue;
    }

    // Coerce common query-string-ish values
    if (typeof v === "string") {
      if (
        def.type === "number" ||
        def.type === "integer" ||
        (Array.isArray(def.type) &&
          (def.type.includes("number") || def.type.includes("integer")))
      ) {
        const n = Number(v);
        if (Number.isNaN(n))
          return { ok: false, error: `Invalid number: ${key}` };
        v = n;
      } else if (
        def.type === "boolean" ||
        (Array.isArray(def.type) && def.type.includes("boolean"))
      ) {
        const s = v.toLowerCase();
        if (s === "true" || s === "1") v = true;
        else if (s === "false" || s === "0") v = false;
      } else if (
        def &&
        (def.type === "object" ||
          def.type === "array" ||
          (Array.isArray(def.type) &&
            (def.type.includes("object") || def.type.includes("array"))))
      ) {
        const t = v.trim();
        if (/^[\{\[]/.test(t)) {
          try {
            v = JSON.parse(t);
          } catch {}
        }
      }
    }

    // Enum (independent of type checks; if present, must match)
    if (Array.isArray(def.enum) && !def.enum.includes(v)) {
      return { ok: false, error: `Invalid value for ${key}: not in enum` };
    }

    // Handle type validation
    if (Array.isArray(def.type)) {
      // General union handling, including null
      const okAny = def.type.some((tt) =>
        tt === "array"
          ? checkType("array", v, def.items || null)
          : checkType(tt, v)
      );
      if (!okAny) {
        const expected = def.type.join("|");
        return { ok: false, error: `Expected ${expected}: ${key}` };
      }
      out[key] = v;
      continue;
    }

    if (typeof def.type === "string") {
      if (PRIMS.has(def.type)) {
        if (def.type === "array") {
          if (!checkType("array", v, def.items || null))
            return { ok: false, error: `Expected array: ${key}` };
        } else if (!checkType(def.type, v)) {
          return { ok: false, error: `Expected ${def.type}: ${key}` };
        }
      }
      // If def.type is a non-primitive or unknown string, we skip deep checks (by design)
    }

    out[key] = v;
  }

  return { ok: true, value: out };
}
