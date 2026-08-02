import { EVENT_TYPES } from './constants.js';

const FIELDS = [
    'event_id', 'turn_index', 'scene_id', 'participants', 'witnesses', 'event_type', 'initiator',
    'target', 'intensity', 'publicity', 'interpretation', 'tags', 'evidence_summary',
];

export const relationshipEventBatchSchema = {
    type: 'object', additionalProperties: false, required: ['events'],
    properties: {
            events: {
                type: 'array', maxItems: 12,
                items: {
                    type: 'object', additionalProperties: false, required: FIELDS,
                    properties: {
                        event_id: { type: 'string', minLength: 1, maxLength: 100 },
                        turn_index: { type: 'integer', minimum: 0 },
                        scene_id: { type: 'string', maxLength: 100 },
                        participants: { type: 'array', items: { type: 'string' }, uniqueItems: true, minItems: 2 },
                        witnesses: { type: 'array', items: { type: 'string' }, uniqueItems: true },
                        event_type: { type: 'string', enum: EVENT_TYPES },
                        initiator: { type: 'string', minLength: 1 }, target: { type: 'string', minLength: 1 },
                        intensity: { type: 'number', minimum: 0, maximum: 1 },
                        publicity: { type: 'string', enum: ['private', 'witnessed', 'public'] },
                        interpretation: { type: 'object', additionalProperties: { type: 'string', maxLength: 500 } },
                        tags: { type: 'array', items: { type: 'string', maxLength: 80 }, uniqueItems: true },
                        evidence_summary: { type: 'string', minLength: 1, maxLength: 500 },
                    },
                },
            },
    },
};

export function validateEventBatch(input, knownNodeIds = []) {
    const errors = [];
    if (!input || typeof input !== 'object' || Array.isArray(input)) return invalid('根对象必须是对象');
    if (Object.keys(input).length !== 1 || !Object.hasOwn(input, 'events')) errors.push('根对象只能包含 events');
    if (!Array.isArray(input.events)) return { valid: false, errors: [...errors, 'events 必须是数组'], events: [] };
    if (input.events.length > 12) errors.push('单次事件数量不能超过 12');
    const known = new Set(knownNodeIds);
    const ids = new Set();
    input.events.forEach((event, index) => validateEvent(event, index, known, ids, errors));
    return { valid: errors.length === 0, errors, events: errors.length === 0 ? input.events : [] };
}

function validateEvent(event, index, known, ids, errors) {
    const prefix = `events[${index}]`;
    if (!event || typeof event !== 'object' || Array.isArray(event)) {
        errors.push(`${prefix} 必须是对象`);
        return;
    }
    const unknown = Object.keys(event).filter(key => !FIELDS.includes(key));
    if (unknown.length) errors.push(`${prefix} 含未知字段: ${unknown.join(', ')}`);
    for (const field of FIELDS) if (!Object.hasOwn(event, field)) errors.push(`${prefix} 缺少 ${field}`);
    if (typeof event.event_id !== 'string' || !event.event_id.trim()) errors.push(`${prefix}.event_id 无效`);
    if (ids.has(event.event_id)) errors.push(`${prefix}.event_id 重复`);
    ids.add(event.event_id);
    if (!Number.isInteger(event.turn_index) || event.turn_index < 0) errors.push(`${prefix}.turn_index 无效`);
    if (!EVENT_TYPES.includes(event.event_type)) errors.push(`${prefix}.event_type 不受支持`);
    if (!Array.isArray(event.participants) || event.participants.length < 2) errors.push(`${prefix}.participants 至少需要两人`);
    if (!Array.isArray(event.witnesses)) errors.push(`${prefix}.witnesses 必须是数组`);
    if (!['private', 'witnessed', 'public'].includes(event.publicity)) errors.push(`${prefix}.publicity 无效`);
    if (typeof event.intensity !== 'number' || event.intensity < 0 || event.intensity > 1) errors.push(`${prefix}.intensity 必须在 0-1`);
    if (!event.interpretation || typeof event.interpretation !== 'object' || Array.isArray(event.interpretation)) errors.push(`${prefix}.interpretation 必须是对象`);
    if (!Array.isArray(event.tags)) errors.push(`${prefix}.tags 必须是数组`);
    if (typeof event.evidence_summary !== 'string' || !event.evidence_summary.trim()) errors.push(`${prefix}.evidence_summary 无效`);
    for (const field of ['initiator', 'target']) validateCharacterId(event[field], `${prefix}.${field}`, known, errors);
    for (const field of ['participants', 'witnesses']) {
        if (Array.isArray(event[field])) for (const id of event[field]) validateCharacterId(id, `${prefix}.${field}`, known, errors);
    }
}

function validateCharacterId(id, path, known, errors) {
    if (typeof id !== 'string' || !id) errors.push(`${path} 无效`);
    else if (known.size && !known.has(id)) errors.push(`${path} 包含未知角色: ${id}`);
}

function invalid(message) {
    return { valid: false, errors: [message], events: [] };
}

export function parseAndValidateEventBatch(text, knownNodes = []) {
    try {
        const input = JSON.parse(stripCodeFence(String(text ?? '')));
        const knownNodeIds = knownNodes.map(node => typeof node === 'string' ? node : node.id);
        return validateEventBatch(normalizeEventBatch(input, knownNodes), knownNodeIds);
    } catch (error) {
        return invalid(`JSON 解析失败: ${error.message}`);
    }
}

function stripCodeFence(text) {
    const trimmed = text.trim();
    const match = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
    return match ? match[1] : trimmed;
}

function normalizeEventBatch(input, knownNodes) {
    if (!input || typeof input !== 'object' || Array.isArray(input) || !Array.isArray(input.events)) return input;
    const known = buildNodeLookup(knownNodes);
    return { events: input.events.map((event, index) => normalizeEvent(event, index, known)) };
}

function buildNodeLookup(nodes) {
    const lookup = new Map();
    for (const node of nodes) {
        const id = typeof node === 'string' ? node : node.id;
        const labels = typeof node === 'string' ? [node] : [node.id, node.displayName, ...(node.aliases ?? [])];
        for (const label of labels) if (typeof label === 'string' && label) lookup.set(label, id);
    }
    return lookup;
}

function normalizeEvent(event, index, known) {
    if (!event || typeof event !== 'object' || Array.isArray(event) || Object.hasOwn(event, 'event_type')) return event;
    const participants = event.participants ?? [];
    return {
        event_id: `turn-${event.turn_index ?? index}-${index}`,
        turn_index: event.turn_index,
        scene_id: event.subtype || '',
        participants: participants.map(id => resolveNodeId(id, known)),
        witnesses: (event.witnesses ?? []).map(id => resolveNodeId(id, known)),
        event_type: mapEventType(event.type, event.subtype),
        initiator: resolveNodeId(participants[0], known),
        target: resolveNodeId(participants[1], known),
        intensity: inferIntensity(event.type, event.subtype),
        publicity: event.witnesses?.length ? 'witnessed' : 'private',
        interpretation: {},
        tags: [event.type, event.subtype].filter(Boolean),
        evidence_summary: String(event.summary ?? event.evidence ?? '').slice(0, 500),
    };
}

function resolveNodeId(value, known) {
    if (typeof value !== 'string') return value;
    if (known.has(value)) return known.get(value);
    const normalized = value.replaceAll('_', ' ');
    return [...known.entries()].find(([label]) => label.replaceAll('_', ' ') === normalized)?.[1] ?? value;
}

function mapEventType(type, subtype = '') {
    const key = `${type ?? ''} ${subtype}`.toLowerCase();
    if (key.includes('care') || key.includes('cooking') || key.includes('household')) return 'support';
    if (key.includes('advice') || key.includes('question') || key.includes('conversation') || key.includes('dining')) return 'meaningful_conversation';
    if (key.includes('ride') || key.includes('date')) return 'date';
    if (key.includes('betray')) return 'betrayal';
    if (key.includes('jealous')) return 'jealousy_trigger';
    if (key.includes('rumor')) return 'rumor';
    return 'meaningful_conversation';
}

function inferIntensity(type, subtype) {
    const key = `${type ?? ''} ${subtype}`.toLowerCase();
    if (key.includes('care') || key.includes('cooking')) return 0.6;
    if (key.includes('date') || key.includes('ride')) return 0.5;
    return 0.35;
}
