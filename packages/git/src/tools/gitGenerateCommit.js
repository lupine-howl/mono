import { runGit, getCwd } from "@loki/git/helpers";

// Simple heuristics to generate a commit subject/body from current changes.
export const gitGenerateCommit = {
  name: "gitGenerateCommit",
  description:
    "Generate a suggested commit subject and body based on current changes. Prefers staged changes when available.",
  parameters: {
    type: "object",
    required: ["ws"],
    properties: {
      ws: { type: "string" },
      preferStaged: { type: "boolean", default: true },
      maxFilesInBody: { type: "integer", default: 20 },
    },
    additionalProperties: false,
  },
  safe: true,
  handler: async ({ ws, preferStaged = true, maxFilesInBody = 20 }) => {
    const cwd = await getCwd(ws);
    const r = await runGit(cwd, ["status", "--porcelain"]);
    if (!r.ok) return { error: r.error };

    const lines = r.stdout.split(/\r?\n/).filter(Boolean);

    const staged = { added: [], modified: [], deleted: [], renamed: [] };
    const unstaged = {
      added: [],
      modified: [],
      deleted: [],
      renamed: [],
      untracked: [],
    };

    for (const ln of lines) {
      // Format: XY <path> or '?? <path>' or rename: XY <old> -> <new>
      const x = ln[0];
      const y = ln[1];
      const rest = ln.slice(3).trim();
      const isUntracked = x === "?" && y === "?";
      const isStaged = !isUntracked && x !== " ";
      const isUnstaged = !isUntracked && y !== " ";

      // Parse rename target if present
      const renameParts = rest.includes(" -> ") ? rest.split(" -> ") : null;

      if (isUntracked) {
        unstaged.untracked.push(rest);
        continue;
      }

      if (isStaged) {
        if (x === "A") staged.added.push(renameParts ? renameParts[1] : rest);
        else if (x === "M")
          staged.modified.push(renameParts ? renameParts[1] : rest);
        else if (x === "D")
          staged.deleted.push(renameParts ? renameParts[1] : rest);
        else if (x === "R")
          staged.renamed.push({
            from: renameParts?.[0] || rest,
            to: renameParts?.[1] || rest,
          });
        else if (x === "C")
          staged.added.push(renameParts ? renameParts[1] : rest);
        // copy: treat as add
        else if (x === "T")
          staged.modified.push(renameParts ? renameParts[1] : rest);
      }

      if (isUnstaged) {
        if (y === "A") unstaged.added.push(renameParts ? renameParts[1] : rest);
        else if (y === "M")
          unstaged.modified.push(renameParts ? renameParts[1] : rest);
        else if (y === "D")
          unstaged.deleted.push(renameParts ? renameParts[1] : rest);
        else if (y === "R")
          unstaged.renamed.push({
            from: renameParts?.[0] || rest,
            to: renameParts?.[1] || rest,
          });
        else if (y === "T")
          unstaged.modified.push(renameParts ? renameParts[1] : rest);
      }
    }

    const stagedCount = Object.values(staged).reduce(
      (n, v) => n + (Array.isArray(v) ? v.length : v.length),
      0
    );
    const use =
      preferStaged && stagedCount > 0 ? { ...staged } : { ...unstaged };
    const source = preferStaged && stagedCount > 0 ? "staged" : "unstaged";

    const files = [
      ...use.added,
      ...use.modified,
      ...use.deleted,
      ...use.renamed.map((r) => r.to || r.from),
      ...(use.untracked || []),
    ];

    // Categorize files
    const cat = { code: 0, docs: 0, tests: 0, styles: 0, config: 0, other: 0 };
    function classify(path) {
      const name = path.split("/").pop() || path;
      const ext = (name.split(".").pop() || "").toLowerCase();
      const lower = path.toLowerCase();

      const isDoc =
        ["md", "mdx", "markdown", "rst", "txt"].includes(ext) ||
        lower.startsWith("docs/");
      if (isDoc) return "docs";

      const isStyle = ["css", "scss", "sass", "less", "styl"].includes(ext);
      if (isStyle) return "styles";

      const isTest = /(^|\/)__tests__(\/|$)|[.](test|spec)[.]/i.test(path);
      if (isTest) return "tests";

      const configNames = new Set([
        "package.json",
        "package-lock.json",
        "pnpm-lock.yaml",
        "yarn.lock",
        ".eslintrc",
        ".eslintrc.json",
        ".prettierrc",
        ".prettierrc.json",
        "tsconfig.json",
        "vite.config.ts",
        "vite.config.js",
        "esbuild.config.js",
        "esbuild.mjs",
        "rollup.config.js",
      ]);
      if (configNames.has(name)) return "config";

      const codeExt = new Set([
        "js",
        "ts",
        "jsx",
        "tsx",
        "py",
        "go",
        "rb",
        "java",
        "cs",
        "cpp",
        "c",
        "rs",
        "php",
      ]);
      if (codeExt.has(ext)) return "code";

      return "other";
    }

    for (const p of files) cat[classify(p)]++;

    const addedCount =
      use.added.length + (use.untracked ? use.untracked.length : 0);
    const modifiedCount = use.modified.length;
    const renamedCount = use.renamed.length;
    const deletedCount = use.deleted.length;

    let verb = "Update";
    if (
      addedCount > 0 &&
      modifiedCount === 0 &&
      deletedCount === 0 &&
      renamedCount === 0
    )
      verb = "Add";
    else if (
      deletedCount > 0 &&
      addedCount === 0 &&
      modifiedCount === 0 &&
      renamedCount === 0
    )
      verb = "Remove";

    // Choose main area
    const areaOrder = ["docs", "tests", "styles", "config", "code", "other"];
    let mainArea = "files";
    let max = -1;
    for (const a of areaOrder) {
      if (cat[a] > max) {
        max = cat[a];
        mainArea = a === "other" ? "files" : a;
      }
    }

    // Determine prefix
    let prefix = "refactor";
    if (
      mainArea === "docs" &&
      addedCount + modifiedCount + deletedCount + renamedCount >= 0
    )
      prefix = "docs";
    else if (mainArea === "tests") prefix = "test";
    else if (mainArea === "styles") prefix = "style";
    else if (mainArea === "config") prefix = "chore";
    else if (mainArea === "code" && addedCount > 0) prefix = "feat";

    // Scopes (top-level dirs)
    const scopesSet = new Set(
      files.map((p) => (p.includes("/") ? p.split("/")[0] : p.split(".")[0]))
    );
    const scopes = Array.from(scopesSet).filter(Boolean);
    const scopeStr = scopes.length
      ? ` in ${scopes.slice(0, 2).join(", ")}${
          scopes.length > 2 ? ` (+${scopes.length - 2} more)` : ""
        }`
      : "";

    const subject =
      `${prefix}: ${verb.toLowerCase()} ${mainArea}${scopeStr}`.trim();

    // Body generation
    function list(arr, mapFn = (x) => x, cap = maxFilesInBody) {
      if (!arr?.length) return null;
      const shown = arr.slice(0, cap).map(mapFn);
      const more = arr.length > cap ? `, … +${arr.length - cap} more` : "";
      return `${shown.join(", ")}${more}`;
    }

    const bodyLines = [];
    const totalChanges =
      addedCount + modifiedCount + renamedCount + deletedCount;
    bodyLines.push(`Changes (${source}):`);
    const addedList = list([...(use.added || []), ...(use.untracked || [])]);
    if (addedList) bodyLines.push(`- Added (${addedCount}): ${addedList}`);
    const modifiedList = list(use.modified);
    if (modifiedList)
      bodyLines.push(`- Modified (${modifiedCount}): ${modifiedList}`);
    const renamedList = list(use.renamed, (r) => `${r.from} → ${r.to}`);
    if (renamedList)
      bodyLines.push(`- Renamed (${renamedCount}): ${renamedList}`);
    const deletedList = list(use.deleted);
    if (deletedList)
      bodyLines.push(`- Deleted (${deletedCount}): ${deletedList}`);

    const catLine = Object.entries(cat)
      .filter(([, n]) => n > 0)
      .map(([k, n]) => `${k}: ${n}`)
      .join(", ");
    if (catLine) bodyLines.push(`\nBy type: ${catLine}`);

    const body = bodyLines.join("\n");

    return {
      ws,
      source,
      subject,
      body,
      files: use,
      categories: cat,
      counts: {
        added: addedCount,
        modified: modifiedCount,
        renamed: renamedCount,
        deleted: deletedCount,
      },
    };
  },
  tags: ["GIT"],
};
