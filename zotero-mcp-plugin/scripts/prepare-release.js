/* eslint-env node */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rootDir = path.resolve(__dirname, "..");
const packageJsonPath = path.join(rootDir, "package.json");
const updateJsonPath = path.join(rootDir, "update.json");
const updateBetaJsonPath = path.join(rootDir, "update-beta.json");

const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
const {
  version,
  config: { addonID },
} = packageJson;

const repoUrl = "https://github.com/cookjohn/zotero-mcp";

function generateUpdateJson(isBeta = false) {
  const currentVersion = isBeta ? `${version}-beta.0` : version;
  const updateLink = `${repoUrl}/releases/download/v${currentVersion}/zotero-mcp-plugin-${currentVersion}.xpi`;

  return {
    addons: {
      [addonID]: {
        updates: [
          {
            version: currentVersion,
            update_link: updateLink,
            applications: {
              zotero: {
                strict_min_version: "6.999",
                strict_max_version: "8.*",
              },
            },
          },
        ],
      },
    },
  };
}

fs.writeFileSync(
  updateJsonPath,
  JSON.stringify(generateUpdateJson(false), null, 2),
);
fs.writeFileSync(
  updateBetaJsonPath,
  JSON.stringify(generateUpdateJson(true), null, 2),
);

console.log(
  `Generated update.json and update-beta.json for version ${version}`,
);
