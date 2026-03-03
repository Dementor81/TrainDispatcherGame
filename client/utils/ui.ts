export class UI {
  public static createButton(
    customClasses: string,
    textContent: string,
    onClick: (event: MouseEvent) => void
  ): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.classList.add('btn');

    const classes = customClasses.split(/\s+/).filter(Boolean);
    if (classes.length > 0) {
      button.classList.add(...classes);
    }

    button.textContent = textContent;
    button.onclick = (event) => onClick(event as MouseEvent);
    return button;
  }

  public static translateTrainType(type: string | null | undefined): string {
    if (!type) {
      return '-';
    }

    switch (type) {
      case 'Passenger':
        return 'Personenzug';
      case 'Freight':
        return 'Güterzug';
      case 'MultipleUnit':
        return 'Triebzug';
      default:
        return type;
    }
  }
}
