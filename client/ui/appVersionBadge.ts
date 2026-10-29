import "../styles/versionBadge.css";

const BADGE_ID = "app-version-badge";

async function fetchServerVersion(): Promise<string> {
  try {
    const response = await fetch("/api/version", { method: "GET", cache: "no-store" });
    if (!response.ok) {
      return "n/a";
    }

    const payload = await response.json() as { version?: string };
    const version = payload.version?.trim();
    return version || "n/a";
  } catch {
    return "n/a";
  }
}

export async function renderAppVersionBadge(): Promise<void> {
  if (document.getElementById(BADGE_ID)) {
    return;
  }

  const version = await fetchServerVersion();
  if (document.getElementById(BADGE_ID)) {
    return;
  }

  const badge = document.createElement("div");
  badge.id = BADGE_ID;
  badge.className = "app-version-badge";
  badge.textContent = version;
  document.body.appendChild(badge);
}
