import * as bootstrap from "bootstrap";

function showInvalidSessionModal(): void {
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
    sessionStorage.removeItem("gameCode");
    sessionStorage.removeItem("playerGameCode");
    sessionStorage.removeItem("gmGameCode");
    window.location.href = "index.html";
  });

  const modal = new bootstrap.Modal(modalElement, {
    backdrop: "static",
    keyboard: false,
  });
  modal.show();
}

async function hasValidSessionCode(storageKey: string): Promise<boolean> {
  let gameCode = (sessionStorage.getItem(storageKey) || "").trim();
  if (!gameCode) {
    const params = new URLSearchParams(window.location.search);
    if (params.get("testing") === "true") {
      gameCode = "DEV101";
      sessionStorage.setItem(storageKey, gameCode);
    }
    else {
      return false;
    }
  }

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

    if (response.ok) {
      sessionStorage.setItem("gameCode", gameCode);
    }
    return response.ok;
  } catch {
    return false;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export async function ensureValidSessionOrShowModal(storageKey: string): Promise<boolean> {
  const validSessionCode = await hasValidSessionCode(storageKey);
  if (!validSessionCode) {
    showInvalidSessionModal();
    return false;
  }

  return true;
}
