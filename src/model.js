import { NUMERIC_EDGE_FIELDS, SCHEMA_VERSION } from './constants.js';

export function createCharacterNode(id, displayName = id, overrides = {}) {
    return {
        id, displayName, aliases: [], identityTags: [], stableTraits: [], romanticPreferences: [], orientationConstraints: [],
        dealbreakers: [], emotionalNeeds: [], attachmentStyle: 'unspecified', loyaltyModel: 'contextual',
        jealousyProfile: [], initiative: 50, riskTolerance: 50, currentCrushes: [], primaryAttachment: null,
        relationshipGoals: [], emotionalAvailability: 50, secrets: [], recentEmotionalState: [], source: null,
        ...overrides,
    };
}

export function createRelationshipEdge(sourceId, targetId, overrides = {}) {
    return {
        sourceId, targetId, familiarity: 0, affinity: 0, attraction: 0, trust: 0, respect: 0, intimacy: 0,
        commitment: 0, dependency: 0, jealousy: 0, resentment: 0, fear: 0, compatibility: 0,
        perceived_interest: 0, romantic_intent: 'none', public_status: 'strangers',
        private_feeling: 'indifferent', exclusivity_expectation: 'none', secrecy: 0, momentum: 0,
        last_meaningful_event: '', unresolved_issues: [], evidence: [], lockedFields: [], ...overrides,
    };
}

export const edgeKey = (sourceId, targetId) => `${encodeURIComponent(sourceId)}->${encodeURIComponent(targetId)}`;

export function ensureNode(graph, id, displayName = id) {
    if (!graph.nodes[id]) graph.nodes[id] = createCharacterNode(id, displayName);
    return graph.nodes[id];
}

export function ensureEdge(graph, sourceId, targetId) {
    ensureNode(graph, sourceId);
    ensureNode(graph, targetId);
    const key = edgeKey(sourceId, targetId);
    if (!graph.edges[key]) graph.edges[key] = createRelationshipEdge(sourceId, targetId);
    return graph.edges[key];
}

export function clampEdge(edge) {
    for (const [field, [minimum, maximum]] of Object.entries(NUMERIC_EDGE_FIELDS)) {
        const value = Number(edge[field]);
        edge[field] = Math.max(minimum, Math.min(maximum, Number.isFinite(value) ? value : 0));
    }
    return edge;
}

export function createEmptyState() {
    return {
        schemaVersion: SCHEMA_VERSION,
        graph: { nodes: {}, edges: {} }, initialGraph: { nodes: {}, edges: {} }, events: [], updates: [],
        snapshots: [], pendingRebuildFrom: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
}

export const clone = value => structuredClone(value);
