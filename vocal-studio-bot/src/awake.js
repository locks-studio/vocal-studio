// Garde le PC éveillé tant que le bot tourne : sinon Windows se met en veille au bout de quelques minutes
// et plus personne ne peut se connecter à Hush. L'écran peut toujours s'éteindre, seule la veille est empêchée.
// Rien n'est changé dans les réglages de Windows : la demande s'arrête toute seule quand le bot s'arrête.
// KEEP_AWAKE=0 dans .env pour ne pas l'utiliser.
const { spawn } = require("child_process");

function keepAwake() {
  if (process.platform !== "win32" || process.env.KEEP_AWAKE === "0") return null;
  // ES_CONTINUOUS | ES_SYSTEM_REQUIRED, redemandé chaque minute, jusqu'à ce que le processus du bot disparaisse
  const script = `
$sig = '[DllImport("kernel32.dll")] public static extern uint SetThreadExecutionState(uint f);'
$k = Add-Type -MemberDefinition $sig -Name Awake -Namespace Hush -PassThru
while (Get-Process -Id ${process.pid} -ErrorAction SilentlyContinue) {
  [void]$k::SetThreadExecutionState([uint32]2147483649)
  Start-Sleep -Seconds 60
}`;
  try {
    const child = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-Command", script], { stdio: "ignore", windowsHide: true });
    child.on("error", () => {});
    const stop = () => { try { child.kill(); } catch {} };
    process.on("exit", stop);
    console.log("Veille du PC empêchée tant que le bot tourne (l'écran peut s'éteindre).");
    return child;
  } catch { return null; }
}

module.exports = { keepAwake };
