import * as bootstrap from "bootstrap";
import "./login.css";
import { clearAdminCode, getAdminCode, loginAdmin, onAdminUnauthorized } from "./api";

let granted = false;
let onGranted: (() => void) | null = null;
let loginModal: bootstrap.Modal | null = null;

export function ensureAdminAccess(next: () => void): void {
  onGranted = next;
  onAdminUnauthorized(() => showLoginModal("Ungültiger Admin-Code."));
  void tryStoredCode();
}

function grant(): void {
  loginModal?.hide();
  if (granted) {
    return;
  }

  granted = true;
  onGranted?.();
}

async function tryStoredCode(): Promise<void> {
  const stored = getAdminCode();
  if (!stored) {
    showLoginModal();
    return;
  }

  try {
    const result = await loginAdmin(stored);
    if (result.ok) {
      grant();
      return;
    }
  } catch {
    // Fall through to the login modal when the server cannot be reached.
  }

  clearAdminCode();
  showLoginModal();
}

function showLoginModal(message = ""): void {
  const modalElement = ensureLoginModal();
  const error = modalElement.querySelector("#adminCodeError") as HTMLDivElement;
  const input = modalElement.querySelector("#adminCodeInput") as HTMLInputElement;
  error.textContent = message;
  error.classList.toggle("d-none", message.length === 0);
  input.classList.toggle("is-invalid", message.length > 0);
  loginModal = bootstrap.Modal.getOrCreateInstance(modalElement, {
    backdrop: "static",
    keyboard: false,
  });
  loginModal.show();
  input.focus();
}

function ensureLoginModal(): HTMLDivElement {
  const existing = document.getElementById("adminLoginModal");
  if (existing instanceof HTMLDivElement) {
    return existing;
  }

  const modalElement = document.createElement("div");
  modalElement.className = "modal fade";
  modalElement.id = "adminLoginModal";
  modalElement.tabIndex = -1;
  modalElement.setAttribute("aria-hidden", "true");
  modalElement.setAttribute("data-bs-backdrop", "static");
  modalElement.setAttribute("data-bs-keyboard", "false");
  modalElement.innerHTML = `
    <div class="modal-dialog modal-dialog-centered">
      <div class="modal-content" data-bs-theme="dark">
        <div class="modal-header">
          <h5 class="modal-title">Admin</h5>
        </div>
        <div class="modal-body">
          <label class="form-label" for="adminCodeInput">Admin-Code</label>
          <input id="adminCodeInput" type="password" class="form-control" autocomplete="current-password">
          <div id="adminCodeError" class="text-danger small mt-2 d-none"></div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-primary" id="adminLoginButton">Anmelden</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(modalElement);

  const input = modalElement.querySelector("#adminCodeInput") as HTMLInputElement;
  const button = modalElement.querySelector("#adminLoginButton") as HTMLButtonElement;
  const submit = () => {
    void submitLogin(input, button);
  };
  button.addEventListener("click", submit);
  input.addEventListener("keydown", (event: KeyboardEvent) => {
    if (event.key === "Enter") {
      event.preventDefault();
      submit();
    }
  });
  input.addEventListener("input", () => {
    input.classList.remove("is-invalid");
    const error = modalElement.querySelector("#adminCodeError") as HTMLDivElement;
    error.classList.add("d-none");
  });
  return modalElement;
}

async function submitLogin(input: HTMLInputElement, button: HTMLButtonElement): Promise<void> {
  const code = input.value.trim();
  if (!code) {
    input.classList.add("is-invalid");
    const error = document.querySelector("#adminCodeError") as HTMLDivElement | null;
    if (error) {
      error.textContent = "Bitte gib den Admin-Code ein.";
      error.classList.remove("d-none");
    }
    return;
  }

  button.disabled = true;
  try {
    const result = await loginAdmin(code);
    if (!result.ok) {
      input.classList.add("is-invalid");
      const error = document.querySelector("#adminCodeError") as HTMLDivElement | null;
      if (error) {
        error.textContent = result.message;
        error.classList.remove("d-none");
      }
      return;
    }

    input.value = "";
    grant();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Admin-Anmeldung fehlgeschlagen.";
    input.classList.add("is-invalid");
    const errorEl = document.querySelector("#adminCodeError") as HTMLDivElement | null;
    if (errorEl) {
      errorEl.textContent = message;
      errorEl.classList.remove("d-none");
    }
  } finally {
    button.disabled = false;
  }
}
