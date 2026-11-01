import type { BlockId } from '../../model/TypeBrands.js';
import { ServiceKey } from '../Plugin.js';

/** Rectangular range of cells within a table. */
export interface CellRange {
	readonly tableId: BlockId;
	readonly fromRow: number;
	readonly fromCol: number;
	readonly toRow: number;
	readonly toCol: number;
}

/** Service for managing multi-cell selection. */
export interface TableSelectionService {
	getSelectedRange(): CellRange | null;
	setSelectedRange(range: CellRange | null): void;
	/** Clears selection state without dispatching a transaction (for use in decorations). */
	clearSelectionSilent(): void;
	getSelectedCellIds(): readonly BlockId[];
	isSelected(cellId: BlockId): boolean;
}

export const TableSelectionServiceKey = new ServiceKey<TableSelectionService>('tableSelection');
