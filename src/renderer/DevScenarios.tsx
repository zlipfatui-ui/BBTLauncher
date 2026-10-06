import { devScenario, devScenarios } from "./launcherApi";

const labels: Record<(typeof devScenarios)[number], string> = {
  install: "Install",
  ready: "Ready",
  repair: "Repair",
  update: "Update game",
  running: "Running",
  "launcher-update": "Launcher update",
  "launcher-downloading": "Launcher downloading",
};

/** Browser-preview only: jump between game and updater states to test the UI. */
export function DevScenarios() {
  const current = devScenario();
  function pick(name: string) {
    const params = new URLSearchParams(location.search);
    params.set("signedin", "");
    params.set("scenario", name);
    location.search = params.toString().replace("signedin=", "signedin");
  }
  return (
    <div className="dev-scenarios" role="group" aria-label="Preview states">
      <span>Preview</span>
      {devScenarios.map((name) => (
        <button
          key={name}
          aria-pressed={current === name}
          onClick={() => pick(name)}
        >
          {labels[name]}
        </button>
      ))}
    </div>
  );
}
