import { Application } from '../core/application';
import { BasePanel } from './basePanel';
import Toast from './toast';

export class TestingPanel extends BasePanel {
  constructor(application: Application) {
    super(application, null);
  }

  protected getContainerId(): string { return 'testingPanel'; }
  protected getContainerClasses(): string { return super.getContainerClasses() + ' bottom-0 end-0'; }

  protected createContent(): HTMLDivElement {
    const container = document.createElement('div');

    const title = document.createElement('h6');
    title.className = 'mb-2 text-warning';
    title.textContent = 'Testing';

    const hint = document.createElement('div');
    hint.className = 'small text-secondary mb-2';
    hint.textContent = 'Local-only helpers (no server train / no timetable).';

    const buttonGroup = document.createElement('div');
    buttonGroup.className = 'd-flex flex-wrap gap-1';

    const addTrainBtn = document.createElement('button');
    addTrainBtn.className = 'btn btn-warning btn-sm';
    addTrainBtn.textContent = 'Add local train';
    addTrainBtn.onclick = () => {
      const train = this.application.trainManager.spawnLocalTestTrain();
      if (!train) {
        Toast.show('Cannot spawn test train (no track layout loaded?)', 'warning');
        return;
      }
    };

    buttonGroup.appendChild(addTrainBtn);

    container.appendChild(title);
    container.appendChild(hint);
    container.appendChild(buttonGroup);
    return container;
  }
}

export default TestingPanel;


