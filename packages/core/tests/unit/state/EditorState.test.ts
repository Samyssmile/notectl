/**
 * EditorState unit tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { EditorState } from '../../../src/state/EditorState';
import { simpleDocument, createMockBlock } from '../../fixtures/blocks';

describe('EditorState', () => {
  let state: EditorState;

  beforeEach(() => {
    state = new EditorState(simpleDocument);
  });

  describe('constructor', () => {
    it('should initialize with default values', () => {
      expect(state.version).toBe(0);
      expect(state.ltime).toBe(0);
      expect(state.doc).toBe(simpleDocument);
      expect(state.selection).toBeNull();
      expect(state.meta).toEqual({});
    });

    it('should set the provided document', () => {
      const customDoc = createMockBlock('doc');
      const customState = new EditorState(customDoc);
      expect(customState.doc).toBe(customDoc);
    });
  });

  describe('withDoc', () => {
    it('should return new state with updated document', () => {
      const newDoc = createMockBlock('doc');
      const newState = state.withDoc(newDoc);

      expect(newState).not.toBe(state);
      expect(newState.doc).toBe(newDoc);
      expect(newState.version).toBe(state.version);
      expect(newState.ltime).toBe(state.ltime);
    });

    it('should not mutate original state', () => {
      const originalDoc = state.doc;
      const newDoc = createMockBlock('doc');
      state.withDoc(newDoc);

      expect(state.doc).toBe(originalDoc);
    });
  });

  describe('withSelection', () => {
    it('should return new state with updated selection', () => {
      const selection = {
        anchor: { blockId: 'p-1', offset: 0 },
        head: { blockId: 'p-1', offset: 5 },
      };
      const newState = state.withSelection(selection);

      expect(newState).not.toBe(state);
      expect(newState.selection).toEqual(selection);
      expect(state.selection).toBeNull();
    });

    it('should handle null selection', () => {
      const selection = {
        anchor: { blockId: 'p-1', offset: 0 },
        head: { blockId: 'p-1', offset: 5 },
      };
      const stateWithSelection = state.withSelection(selection);
      const stateWithNull = stateWithSelection.withSelection(null);

      expect(stateWithNull.selection).toBeNull();
    });
  });

  describe('withVersion', () => {
    it('should return new state with incremented version', () => {
      const newState = state.withVersion(5);

      expect(newState).not.toBe(state);
      expect(newState.version).toBe(5);
      expect(state.version).toBe(0);
    });

    it('should handle version 0', () => {
      const stateV5 = state.withVersion(5);
      const stateV0 = stateV5.withVersion(0);

      expect(stateV0.version).toBe(0);
    });
  });

  describe('withLtime', () => {
    it('should return new state with incremented logical time', () => {
      const newState = state.withLtime(10);

      expect(newState).not.toBe(state);
      expect(newState.ltime).toBe(10);
      expect(state.ltime).toBe(0);
    });
  });

  describe('clone', () => {
    it('should create independent copy', () => {
      const selection = {
        anchor: { blockId: 'p-1', offset: 0 },
        head: { blockId: 'p-1', offset: 5 },
      };
      state = state.withSelection(selection);
      state = state.withVersion(5);
      state.meta.custom = 'value';

      const newState = state.withLtime(10);

      expect(newState.doc).toBe(state.doc); // Document is shared (immutable)
      expect(newState.selection).toEqual(state.selection);
      expect(newState.meta).not.toBe(state.meta); // Meta is cloned
      expect(newState.meta).toEqual(state.meta);
    });
  });

  describe('toJSON', () => {
    it('should serialize state to JSON', () => {
      const selection = {
        anchor: { blockId: 'p-1', offset: 0 },
        head: { blockId: 'p-1', offset: 5 },
      };
      state = state.withSelection(selection);
      state = state.withVersion(5);
      state = state.withLtime(10);
      state.meta.custom = 'value';

      const json = state.toJSON();

      expect(json).toEqual({
        version: 5,
        ltime: 10,
        doc: simpleDocument,
        selection,
        meta: { custom: 'value' },
      });
    });

    it('should handle null selection', () => {
      const json = state.toJSON();
      expect(json).toHaveProperty('selection', null);
    });
  });

  describe('fromJSON', () => {
    it('should deserialize state from JSON', () => {
      const json = {
        version: 5,
        ltime: 10,
        doc: simpleDocument,
        selection: {
          anchor: { blockId: 'p-1', offset: 0 },
          head: { blockId: 'p-1', offset: 5 },
        },
        meta: { custom: 'value' },
      };

      const restoredState = EditorState.fromJSON(json);

      expect(restoredState.version).toBe(5);
      expect(restoredState.ltime).toBe(10);
      expect(restoredState.doc).toEqual(simpleDocument);
      expect(restoredState.selection).toEqual(json.selection);
      expect(restoredState.meta).toEqual({ custom: 'value' });
    });

    it('should handle missing optional fields', () => {
      const json = {
        version: 0,
        ltime: 0,
        doc: simpleDocument,
        selection: null,
        meta: {},
      };

      const restoredState = EditorState.fromJSON(json);

      expect(restoredState.selection).toBeNull();
      expect(restoredState.meta).toEqual({});
    });
  });

  describe('immutability', () => {
    it('should maintain immutability through multiple operations', () => {
      const state1 = new EditorState(simpleDocument);
      const state2 = state1.withVersion(1);
      const state3 = state2.withLtime(1);
      const state4 = state3.withSelection({
        anchor: { blockId: 'p-1', offset: 0 },
        head: { blockId: 'p-1', offset: 5 },
      });

      expect(state1.version).toBe(0);
      expect(state2.version).toBe(1);
      expect(state3.ltime).toBe(1);
      expect(state4.selection).not.toBeNull();
      expect(state1.selection).toBeNull();
    });
  });
});
