import "bootstrap/dist/css/bootstrap.min.css";
import "./styles/landing.css";

window.addEventListener("DOMContentLoaded", () => {
  const onlineActions = document.getElementById("onlineActions");
  const serverUnavailableMessage = document.getElementById("serverUnavailableMessage");
  const nameInput = document.getElementById("joinNameInput") as HTMLInputElement | null;
  const codeInput = document.getElementById("joinCodeInput") as HTMLInputElement | null;
  const joinButton = document.getElementById("joinGameButton") as HTMLButtonElement | null;
  const hostButton = document.getElementById("hostGameButton") as HTMLButtonElement | null;

  if (!onlineActions || !serverUnavailableMessage || !nameInput || !codeInput || !joinButton || !hostButton) {
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
      const response = await fetch("/api/scenarios", {
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

  const prefillGameCodeFromUrl = () => {
    const gameCode = new URLSearchParams(window.location.search).get("gamecode")?.trim();
    if (!gameCode) {
      return;
    }

    codeInput.value = gameCode;
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

  const isGameCodeValid = async (gameCode: string): Promise<boolean> => {
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

      return response.ok;
    } catch {
      return false;
    } finally {
      window.clearTimeout(timeoutId);
    }
  };

  const joinGame = async () => {
    const playerName = requireValue(nameInput, "Bitte gib deinen Namen ein.");
    if (!playerName) {
      return;
    }

    const gameCode = requireValue(codeInput, "Bitte gib einen Game-Code ein.");
    if (!gameCode) {
      return;
    }

    joinButton.disabled = true;
    const validGameCode = await isGameCodeValid(gameCode);
    joinButton.disabled = false;
    if (!validGameCode) {
      codeInput.setCustomValidity("Der Game-Code ist ungültig oder nicht aktiv.");
      codeInput.reportValidity();
      return;
    }

    sessionStorage.setItem("playerName", playerName);
    sessionStorage.setItem("playerGameCode", gameCode);
    window.location.href = "main.html";
  };

  const hostGame = async () => {
    hostButton.disabled = true;
    try {
      const response = await fetch("/api/games", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        let serverMessage = "";
        try {
          const errPayload = await response.json() as { message?: string };
          serverMessage = errPayload.message?.trim() ?? "";
        } catch {
          // ignore parse errors and fall back to generic message
        }
        throw new Error(serverMessage || `Server returned ${response.status}`);
      }

      const payload = await response.json() as { gameCode?: string };
      const gameCode = payload.gameCode?.trim();
      if (!gameCode) {
        throw new Error("Missing game code");
      }

      const playerName = nameInput.value.trim();
      if (playerName) {
        sessionStorage.setItem("playerName", playerName);
      }
      sessionStorage.setItem("gmGameCode", gameCode);
      window.location.href = "gameMaster.html";
    } catch (error) {
      console.error("Failed to create game session", error);
      const message = error instanceof Error ? error.message : "Neues Spiel konnte nicht gestartet werden.";
      alert(`Neues Spiel konnte nicht gestartet werden.\n${message}`);
    } finally {
      hostButton.disabled = false;
    }
  };

  prefillGameCodeFromUrl();

  joinButton.addEventListener("click", () => {
    void joinGame();
  });
  hostButton.addEventListener("click", () => {
    void hostGame();
  });
  nameInput.addEventListener("input", () => clearValidity(nameInput));
  codeInput.addEventListener("input", () => clearValidity(codeInput));

  [nameInput, codeInput].forEach((input) => {
    input.addEventListener("keydown", (event: KeyboardEvent) => {
      if (event.key !== "Enter") {
        return;
      }

      event.preventDefault();
      void joinGame();
    });
  });
});
