import { SCHEMA_VERSION } from './constants.js';
import { createEmptyState } from './model.js';

export function migrateState(rawState) {
    if (!rawState) return createEmptyState();
    const state = structuredClone(rawState);
    const version = Number(state.schemaVersion ?? 0);
    if (version > SCHEMA_VERSION) throw new Error(`状态版本 ${version} 高于扩展支持的 ${SCHEMA_VERSION}`);
    if (version === 0) {
        const empty = createEmptyState();
        Object.assign(empty, state, { schemaVersion: 1 });
        if (!empty.graph) empty.graph = { nodes: {}, edges: {} };
        if (!empty.initialGraph) empty.initialGraph = structuredClone(empty.graph);
        if (!empty.events) empty.events = [];
        if (!empty.updates) empty.updates = [];
        if (!empty.snapshots) empty.snapshots = [];
        return empty;
    }
    return state;
}
