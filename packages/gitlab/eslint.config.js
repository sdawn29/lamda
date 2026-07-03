import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { baseConfig } from "../../eslint.config.base.mjs";

const tsconfigRootDir = dirname(fileURLToPath(import.meta.url));

export default baseConfig(tsconfigRootDir);
