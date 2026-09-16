import { BasePanel } from "../ui/basePanel";
import { fetchSessionNetworkDiagram } from "../network/api";

export class NetworkPlanPanel extends BasePanel {
  private host!: HTMLDivElement;
  private loaded = false;
  private loading = false;

  constructor() {
    super(null, {
      width: 900,
      height: 380,
      left: 630,
      bottom: 0,
      title: "Netzplan",
      resizable: true,
      closeable: true,
    });
    this.show();
  }

  protected createContent(): HTMLDivElement {
    this.host = document.createElement("div");
    this.host.className = "gm-network-plan";
    this.host.textContent = "Laden…";
    return this.host;
  }

  public override show(): void {
    super.show();
    void this.load();
  }

  private async load(): Promise<void> {
    if (this.loaded || this.loading) {
      return;
    }

    this.loading = true;
    try {
      const svgText = await fetchSessionNetworkDiagram();
      this.inlineDiagram(svgText);
      this.loaded = true;
    } catch (error) {
      console.error("NetworkPlanPanel: failed to load diagram", error);
      const errorEl = document.createElement("div");
      errorEl.className = "text-muted p-2";
      errorEl.textContent = "Netzplan konnte nicht geladen werden.";
      this.host.replaceChildren(errorEl);
    } finally {
      this.loading = false;
    }
  }

  private inlineDiagram(svgText: string): void {
    const parsed = new DOMParser().parseFromString(svgText, "image/svg+xml");
    const svg = parsed.documentElement;
    if (svg.querySelector("parsererror") || svg.localName !== "svg") {
      throw new Error("Invalid network diagram");
    }

    this.host.replaceChildren(document.importNode(svg, true));
  }
}

export default NetworkPlanPanel;
