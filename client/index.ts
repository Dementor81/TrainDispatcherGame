import "bootstrap/dist/css/bootstrap.min.css";
import "./styles/landing.css";

window.addEventListener("DOMContentLoaded", () => {
  const onlineActions = document.getElementById("onlineActions");
  const serverUnavailableMessage = document.getElementById("serverUnavailableMessage");
  const nameInput = document.getElementById("joinNameInput") as HTMLInputElement | null;
  const codeInput = document.getElementById("joinCodeInput") as HTMLInputElement | null;
  const joinButton = document.getElementById("joinGameButton") as HTMLButtonElement | null;

  if (!onlineActions || !serverUnavailableMessage || !nameInput || !codeInput || !joinButton) {
    return;
  }

  const setServerAvailableState = (isAvailable: boolean) => {
    onlineActions.classList.toggle("d-none", !isAvailable);
    serverUnavailableMessage.classList.toggle("d-none", isAvailable);
  };

  const checkServerAvailability = async (): Promise<boolean> => {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 5000);

    try {
      const response = await fetch("/api/layouts", {
        method: "GET",
        cache: "no-store",
        signal: controller.signal,
      });

      return response.ok;
    } catch {
      return false;
    } finally {
      window.clearTimeout(timeoutId);
    }
  };

  void checkServerAvailability().then((isAvailable) => {
    setServerAvailableState(isAvailable);
  });

  const clearValidity = (input: HTMLInputElement) => {
    input.setCustomValidity("");
  };

  const requireValue = (input: HTMLInputElement, message: string): string | null => {
    const value = input.value.trim();
    if (!value) {
      input.setCustomValidity(message);
      input.reportValidity();
      return null;
    }

    input.setCustomValidity("");
    return value;
  };

  const joinGame = () => {
    const playerName = requireValue(nameInput, "Bitte gib deinen Namen ein.");
    if (!playerName) {
      return;
    }

    const gameCode = requireValue(codeInput, "Bitte gib einen Game-Code ein.");
    if (!gameCode) {
      return;
    }

    sessionStorage.setItem("playerName", playerName);
    sessionStorage.setItem("gameCode", gameCode);
    window.location.href = "main.html";
  };

  joinButton.addEventListener("click", joinGame);
  nameInput.addEventListener("input", () => clearValidity(nameInput));
  codeInput.addEventListener("input", () => clearValidity(codeInput));

  [nameInput, codeInput].forEach((input) => {
    input.addEventListener("keydown", (event: KeyboardEvent) => {
      if (event.key !== "Enter") {
        return;
      }

      event.preventDefault();
      joinGame();
    });
  });
});
