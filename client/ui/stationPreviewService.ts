export class StationPreviewService {
  private previewRequests: Map<string, Promise<string>> = new Map();

  public async loadPreview(stationId: string): Promise<string> {
    const activeRequest = this.previewRequests.get(stationId);
    if (activeRequest) {
      return activeRequest;
    }

    const request = this.generateStationPreview(stationId)
      .finally(() => {
        this.previewRequests.delete(stationId);
      });

    this.previewRequests.set(stationId, request);
    return request;
  }

  public clearCache(): void {
    this.previewRequests.clear();
  }

  private async generateStationPreview(stationId: string): Promise<string> {
    const app = (window as any).app as any;
    if (!app?.trackLayoutManager || !app?.renderer) {
      throw new Error('Preview renderer is not ready');
    }

    await app.trackLayoutManager.loadTrackLayout(stationId);
    return app.renderer.capturePreview();
  }
}
