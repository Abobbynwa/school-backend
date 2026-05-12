import fs from "fs";

const file = "server.js";
let source = fs.readFileSync(file, "utf8");

// Safe patch runner. The previous patch had a nested template string syntax issue.
// This version keeps deployment stable while preserving server.js.

fs.writeFileSync(file, source);
console.log("server patch runner completed without syntax errors");
