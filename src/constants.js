export const EXTENSION_ID = 'st_dynamic_relationships';
export const STORE_KEY = 'st_dynamic_relationships_state';
export const MESSAGE_KEY = 'st_dynamic_relationships';
export const PROMPT_KEY = 'st_dynamic_relationships_prompt';
export const SCHEMA_VERSION = 1;

export const EVENT_TYPES = [
    'meaningful_conversation', 'support', 'vulnerability', 'shared_success', 'rescue', 'gift',
    'flirtation', 'confession', 'date', 'physical_affection', 'rejection', 'humiliation', 'lie',
    'betrayal', 'neglect', 'rivalry', 'jealousy_trigger', 'boundary_respected', 'boundary_violated',
    'rumor', 'discovery', 'breakup', 'reconciliation', 'commitment',
];

export const NUMERIC_EDGE_FIELDS = {
    familiarity: [0, 100], affinity: [-100, 100], attraction: [0, 100], trust: [0, 100],
    respect: [-100, 100], intimacy: [0, 100], commitment: [0, 100], dependency: [0, 100],
    jealousy: [0, 100], resentment: [0, 100], fear: [0, 100], compatibility: [-100, 100],
    perceived_interest: [0, 100], secrecy: [0, 100], momentum: [-100, 100],
};

export const DEFAULT_SETTINGS = {
    enabled: true, autoExtract: true, promptDepth: 1, promptBudget: 1400,
    extractionResponseLength: 900, maxEvents: 300, maxSnapshots: 60, debugMode: false,
};
