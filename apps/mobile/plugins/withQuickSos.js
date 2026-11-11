/**
 * Config plugin: SOS rápido.
 *
 * Android: nada a fazer aqui — serviço do botão liga/desliga, bloco das Configurações
 * Rápidas e receivers vêm do AndroidManifest do módulo local modules/quick-sos.
 *
 * iOS: o App Intent "Pedir ajuda" (Siri / Atalhos / Toque traseiro / Botão de Ação) precisa
 * ser compilado no target do app — o extrator de metadados de App Intents não lê pods
 * estáticos. Copia modules/quick-sos/app-intents/*.swift para ios/<App>/ e registra no
 * projeto. Também define pt-BR como idioma de desenvolvimento, para a Siri reconhecer as
 * frases em português.
 */
const fs = require("node:fs");
const path = require("node:path");
const { withXcodeProject, IOSConfig } = require("expo/config-plugins");

const SOURCE_DIR = path.resolve(
  __dirname,
  "..",
  "modules",
  "quick-sos",
  "app-intents",
);
const DEV_REGION = "pt-BR";

function withIosAppIntents(baseConfig) {
  return withXcodeProject(baseConfig, (cfg) => {
    const { projectName, platformProjectRoot } = cfg.modRequest;
    const project = cfg.modResults;

    for (const file of fs.readdirSync(SOURCE_DIR)) {
      if (!file.endsWith(".swift")) {
        continue;
      }
      fs.copyFileSync(
        path.join(SOURCE_DIR, file),
        path.join(platformProjectRoot, projectName, file),
      );
      // Ignora duplicatas sozinho (prebuild rodado mais de uma vez).
      IOSConfig.XcodeUtils.addBuildSourceFileToGroup({
        filepath: path.join(projectName, file),
        groupName: projectName,
        project,
      });
    }

    const pbxProject = project.getFirstProject().firstProject;
    const quoted = `"${DEV_REGION}"`;
    pbxProject.developmentRegion = quoted;
    const regions = pbxProject.knownRegions ?? [];
    if (!regions.some((r) => String(r).replace(/"/g, "") === DEV_REGION)) {
      pbxProject.knownRegions = [...regions, quoted];
    }
    return cfg;
  });
}

module.exports = function withQuickSos(config) {
  return withIosAppIntents(config);
};
