import * as bootstrap from "bootstrap";

export type GmSessionState = "missing-code" | "active" | "pending";

export function showInvalidSessionModal(): void {
  const existingModal = document.getElementById("invalidSessionModal");
  if (existingModal) {
    const modal = new bootstrap.Modal(existingModal, {
      backdrop: "static",
      keyboard: false,
    });
    modal.show();
    return;
  }

  const modalElement = document.createElement("div");
  modalElement.className = "modal fade";
  modalElement.id = "invalidSessionModal";
  modalElement.tabIndex = -1;
  modalElement.setAttribute("aria-hidden", "true");
  modalElement.setAttribute("data-bs-backdrop", "static");
  modalElement.setAttribute("data-bs-keyboard", "false");

  modalElement.innerHTML = `
    <div class="modal-dialog modal-dialog-centered">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title">Sitzung ungültig</h5>
        </div>
        <div class="modal-body">
          <p class="mb-0">Kein gültiger Game-Code gefunden. Bitte kehre zur Startseite zurück.</p>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-primary" id="returnToLandingButton">Zur Startseite</button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(modalElement);
  const returnButton = modalElement.querySelector("#returnToLandingButton") as HTMLButtonElement;
  returnButton.addEventListener("click", () => {
    clearSessionCodes();
    window.location.href = "index.html";
  });

  const modal = new bootstrap.Modal(modalElement, {
    backdrop: "static",
    keyboard: false,
  });
  modal.show();
}

export function handleSessionEnded(options?: { redirectImmediately?: boolean }): void {
  if (sessionEndedHandled) {
    return;
  }
  sessionEndedHandled = true;
  clearSessionCodes();

  if (options?.redirectImmediately) {
    window.location.href = "index.html";
    return;
  }

  showSessionEndedModal();
}

function clearSessionCodes(): void {
  sessionStorage.removeItem("gameCode");
  sessionStorage.removeItem("playerGameCode");
  sessionStorage.removeItem("gmGameCode");
}

function showSessionEndedModal(): void {
  const modalElement = document.createElement("div");
  modalElement.className = "modal fade";
  modalElement.id = "sessionEndedModal";
  modalElement.tabIndex = -1;
  modalElement.setAttribute("aria-hidden", "true");
  modalElement.setAttribute("data-bs-backdrop", "static");
  modalElement.setAttribute("data-bs-keyboard", "false");

  modalElement.innerHTML = `
    <div class="modal-dialog modal-dialog-centered">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title">Sitzung beendet</h5>
        </div>
        <div class="modal-body">
          <p class="mb-0">Der Spielleiter hat das Spiel beendet.</p>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-primary" id="sessionEndedLandingButton">Zur Startseite</button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(modalElement);
  const returnButton = modalElement.querySelector("#sessionEndedLandingButton") as HTMLButtonElement;
  returnButton.addEventListener("click", () => {
    window.location.href = "index.html";
  });

  const modal = new bootstrap.Modal(modalElement, {
    backdrop: "static",
    keyboard: false,
  });
  modal.show();
}

const DEVELOPMENT_GAME_CODE = "DEV101";
let sessionEndedHandled = false;

function isTestingMode(): boolean {
  return new URLSearchParams(window.location.search).get("testing") === "true";
}

function resolveStoredGameCode(storageKey: string): string {
  if (isTestingMode()) {
    sessionStorage.setItem(storageKey, DEVELOPMENT_GAME_CODE);
    return DEVELOPMENT_GAME_CODE;
  }

  return (sessionStorage.getItem(storageKey) || "").trim();
}

async function fetchSessionStatus(gameCode: string): Promise<number | null> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 5000);

  try {
    const url = new URL("/api/simulation/status", window.location.origin);
    url.searchParams.set("gameCode", gameCode);
    const response = await fetch(url.toString(), {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
    });
    return response.status;
  } catch {
    return null;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export async function probeGmSession(): Promise<GmSessionState> {
  if (isTestingMode()) {
    sessionStorage.setItem("gmGameCode", DEVELOPMENT_GAME_CODE);
    return "pending";
  }

  const gameCode = resolveStoredGameCode("gmGameCode");
  if (!gameCode) {
    return "missing-code";
  }

  const status = await fetchSessionStatus(gameCode);
  if (status === 200) {
    sessionStorage.setItem("gameCode", gameCode);
    return "active";
  }
  if (status === 404) {
    return "pending";
  }

  return "missing-code";
}

async function hasValidSessionCode(storageKey: string): Promise<boolean> {
  const gameCode = resolveStoredGameCode(storageKey);
  if (!gameCode) {
    return false;
  }

  const status = await fetchSessionStatus(gameCode);
  if (status === 200) {
    sessionStorage.setItem("gameCode", gameCode);
    return true;
  }

  return false;
}

export async function ensureValidSessionOrShowModal(storageKey: string): Promise<boolean> {
  const validSessionCode = await hasValidSessionCode(storageKey);
  if (!validSessionCode) {
    showInvalidSessionModal();
    return false;
  }

  return true;
}
