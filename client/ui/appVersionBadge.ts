import "../styles/versionBadge.css";

const BADGE_ID = "app-version-badge";

function normalizeToMajorMinor(version: string | null | undefined): string {
  if (!version) {
    return "0.0";
  }

  const cleanVersion = version.trim().split(/[+-]/)[0] ?? "";
  const [rawMajor = "0", rawMinor = "0"] = cleanVersion.split(".");
  const major = Number.parseInt(rawMajor, 10);
  const minor = Number.parseInt(rawMinor, 10);

  const safeMajor = Number.isFinite(major) ? major : 0;
  const safeMinor = Number.isFinite(minor) ? minor : 0;
  return `${safeMajor}.${safeMinor}`;
}

async function fetchServerVersion(): Promise<string> {
  try {
    const response = await fetch("/api/version", { method: "GET", cache: "no-store" });
    if (!response.ok) {
      return "n/a";
    }

    const payload = await response.json() as { version?: string };
    const version = payload.version?.trim();
    if (!version) {
      return "n/a";
    }

    return normalizeToMajorMinor(version);
  } catch {
    return "n/a";
  }
}

export async function renderAppVersionBadge(): Promise<void> {
  if (document.getElementById(BADGE_ID)) {
    return;
  }

  const badge = document.createElement("div");
  badge.id = BADGE_ID;
  badge.className = "app-version-badge";

  const appVersion = normalizeToMajorMinor(__APP_VERSION__);
  badge.textContent = `App ${appVersion} | Server ...`;
  document.body.appendChild(badge);

  const serverVersion = await fetchServerVersion();
  badge.textContent = `App ${appVersion} | Server ${serverVersion}`;
}
