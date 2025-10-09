/**
 * Table Grid Picker Component
 * Visual grid selector for table dimensions
 */

export class TablePickerComponent extends HTMLElement {
  private gridContainer: HTMLDivElement | null = null;
  private label: HTMLDivElement | null = null;
  private maxRows = 10;
  private maxCols = 10;
  private onSelect?: (rows: number, cols: number) => void;

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  connectedCallback(): void {
    this.render();
  }

  setSelectHandler(handler: (rows: number, cols: number) => void): void {
    this.onSelect = handler;
  }

  private render(): void {
    if (!this.shadowRoot) return;

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          position: absolute;
          background: white;
          border: 1px solid #ddd;
          border-radius: 6px;
          padding: 12px;
          box-shadow: 0 4px 12px rgba(0,0,0,0.15);
          z-index: 1000;
          display: none;
        }

        :host(.visible) {
          display: block;
        }

        .label {
          font-size: 13px;
          font-weight: 600;
          color: #495057;
          margin-bottom: 8px;
          text-align: center;
        }

        .grid {
          display: grid;
          grid-template-columns: repeat(${this.maxCols}, 24px);
          gap: 2px;
          margin-bottom: 8px;
        }

        .cell {
          width: 24px;
          height: 24px;
          border: 1px solid #dee2e6;
          background: white;
          cursor: pointer;
          transition: all 0.1s;
        }

        .cell:hover {
          border-color: #667eea;
        }

        .cell.selected {
          background: #667eea;
          border-color: #667eea;
        }

        .instructions {
          font-size: 11px;
          color: #6c757d;
          text-align: center;
        }
      </style>
      <div class="label">Wähle Tabellengröße</div>
      <div class="grid"></div>
      <div class="instructions">Klicke um auszuwählen</div>
    `;

    this.label = this.shadowRoot.querySelector('.label');
    this.gridContainer = this.shadowRoot.querySelector('.grid');

    if (this.gridContainer) {
      // Create grid cells
      for (let row = 0; row < this.maxRows; row++) {
        for (let col = 0; col < this.maxCols; col++) {
          const cell = document.createElement('div');
          cell.className = 'cell';
          cell.dataset.row = String(row);
          cell.dataset.col = String(col);

          cell.addEventListener('mouseenter', () => {
            this.highlightCells(row + 1, col + 1);
          });

          cell.addEventListener('click', () => {
            if (this.onSelect) {
              this.onSelect(row + 1, col + 1);
            }
            this.hide();
          });

          this.gridContainer?.appendChild(cell);
        }
      }

      // Reset on mouse leave
      this.addEventListener('mouseleave', () => {
        this.highlightCells(0, 0);
      });
    }
  }

  private highlightCells(rows: number, cols: number): void {
    if (this.label) {
      if (rows > 0 && cols > 0) {
        this.label.textContent = `${rows} × ${cols} Tabelle`;
      } else {
        this.label.textContent = 'Wähle Tabellengröße';
      }
    }

    const cells = this.shadowRoot?.querySelectorAll('.cell');
    cells?.forEach((cell) => {
      const row = parseInt((cell as HTMLElement).dataset.row || '0', 10);
      const col = parseInt((cell as HTMLElement).dataset.col || '0', 10);

      if (row < rows && col < cols) {
        cell.classList.add('selected');
      } else {
        cell.classList.remove('selected');
      }
    });
  }

  show(x: number, y: number): void {
    this.classList.add('visible');
    this.style.left = `${x}px`;
    this.style.top = `${y}px`;
  }

  hide(): void {
    this.classList.remove('visible');
    this.highlightCells(0, 0);
  }
}

// Register custom element
if (!customElements.get('table-picker')) {
  customElements.define('table-picker', TablePickerComponent);
}
