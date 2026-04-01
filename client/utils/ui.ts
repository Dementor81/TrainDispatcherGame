export class UI {
  public static createButton(
    customClasses: string | null | undefined,
    textContent: string | null | undefined,
    onClick: (event: MouseEvent) => void
  ): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';

    button.className = customClasses ?? '';
    button.textContent = textContent ?? '';
    button.classList.add('btn');
    button.onclick = (event) => onClick(event as MouseEvent);
    return button;
  }

  public static createDiv(
    customClasses: string | null | undefined,
    id: string | null | undefined = null,
  ): HTMLDivElement {
    const div = document.createElement('div');
    div.className = customClasses ?? '';
    div.id = id ?? '';

    return div;
  }

  public static createSpan(
    customClasses: string | null | undefined,
    textContent: string | null | undefined,
  ): HTMLSpanElement {
    const span = document.createElement('span');
    span.className = customClasses ?? '';
    span.textContent = textContent ?? '';
    return span;
  }


}
