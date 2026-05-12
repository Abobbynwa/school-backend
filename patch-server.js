import fs from "fs";

const file = "server.js";
let source = fs.readFileSync(file, "utf8");

// Safe deploy patch runner. This keeps the Render start command stable.
// Full SMTP/public-content routes can be added directly to server.js next.

fs.writeFileSync(file, source);
console.log("server patch runner completed");
