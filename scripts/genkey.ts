import { randomBytes } from "node:crypto";

const bytes = randomBytes(32);
process.stdout.write(bytes.toString("base64") + "\n");
