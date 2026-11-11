// Signature « ad hoc » des applis Mac, juste avant leur mise en zip (afterPack d'electron-builder).
// Sans compte développeur Apple, electron-builder ne signe rien ; or un Mac Apple Silicon refuse d'ouvrir
// une appli dont la signature est absente ou cassée. Une signature ad hoc suffit pour qu'elle s'ouvre.
const { execFileSync } = require("child_process");
const path = require("path");

exports.default = async function (context) {
  if (context.electronPlatformName !== "darwin") return;
  const app = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  execFileSync("codesign", ["--force", "--deep", "--sign", "-", app], { stdio: "inherit" });
  execFileSync("codesign", ["--verify", "--deep", "--strict", app], { stdio: "inherit" });
  console.log(`  • signature ad hoc : ${path.basename(app)}`);
};
