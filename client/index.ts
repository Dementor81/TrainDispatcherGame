import "bootstrap/dist/css/bootstrap.min.css";
import "./styles/landing.css";

window.addEventListener("DOMContentLoaded", () => {
  const nameInput = document.getElementById("joinNameInput") as HTMLInputElement | null;
  const codeInput = document.getElementById("joinCodeInput") as HTMLInputElement | null;
  const joinButton = document.getElementById("joinGameButton") as HTMLButtonElement | null;

  if (!nameInput || !codeInput || !joinButton) {
    return;
  }

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
