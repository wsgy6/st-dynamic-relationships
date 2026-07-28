import { clone, createCharacterNode, ensureNode } from './model.js';

export function buildInitialGraph(context) {
    const graph = { nodes: {}, edges: {} };
    ensureNode(graph, '{{user}}', context.name1 || '{{user}}');
    const cards = getActiveCards(context);
    for (const card of cards) {
        const cardName = card?.name ?? card?.data?.name;
        const profiles = extractBookProfiles(card);
        if (!profiles.length && cardName) ensureNode(graph, normalizeId(cardName), cardName);
        for (const profile of profiles) {
            graph.nodes[profile.id] = createCharacterNode(profile.id, profile.displayName, profile);
        }
    }
    return graph;
}

function getActiveCards(context) {
    if (context.groupId) {
        const group = context.groups?.find(item => String(item.id) === String(context.groupId));
        const avatars = new Set(group?.members ?? []);
        return context.characters.filter(character => avatars.has(character.avatar));
    }
    return context.characterId === undefined ? [] : [context.characters[context.characterId]];
}

export function extractBookProfiles(card) {
    const entries = card?.data?.character_book?.entries ?? card?.character_book?.entries ?? [];
    const profiles = [];
    for (const entry of entries) {
        const content = String(entry.content ?? '');
        const explicitName = readField(content, ['name', '名称']);
        if (!explicitName) continue;
        if (!looksLikeProfile(content)) continue;
        const aliases = readListField(content, ['nicknames', 'aliases', '昵称']);
        profiles.push({
            id: normalizeId(explicitName), displayName: explicitName, aliases,
            identityTags: readListField(content, ['identity_tags', '身份标签', '类别或标签']),
            stableTraits: readListField(content, ['personality', 'stable_traits', '性格']),
            romanticPreferences: readListField(content, ['romantic_preferences', '择偶偏好', '偏好']),
            orientationConstraints: readListField(content, ['orientation_constraints', 'orientation', '取向约束', '取向']),
            dealbreakers: readListField(content, ['dealbreakers', '底线']),
            emotionalNeeds: readListField(content, ['emotional_needs', '情感需求']),
            source: { type: 'character_book', key: String(entry.id ?? entry.uid ?? explicitName) },
        });
    }
    return deduplicateProfiles(profiles);
}

function readField(content, names) {
    for (const line of content.split(/\r?\n/).slice(0, 80)) {
        const separator = line.indexOf(':');
        if (separator < 0) continue;
        const key = line.slice(0, separator).replace(/^[-#\s]+/, '').trim().toLowerCase();
        if (!names.some(name => key === name.toLowerCase())) continue;
        return cleanValue(line.slice(separator + 1));
    }
    return '';
}

function readListField(content, names) {
    const value = readField(content, names);
    if (!value) return [];
    return value.replace(/^\[|\]$/g, '').split(/[,，、|]/).map(cleanValue).filter(Boolean).slice(0, 20);
}

function cleanValue(value) {
    return String(value).trim().replace(/^['"]|['"]$/g, '');
}

function looksLikeProfile(content) {
    const head = content.slice(0, 1500).toLowerCase();
    return head.includes('profile') || head.includes('年龄') || head.includes('personality') || head.includes('性格');
}

function normalizeId(name) {
    return String(name).trim().replace(/\s+/g, '_');
}

function deduplicateProfiles(profiles) {
    const result = new Map();
    for (const profile of profiles) if (!result.has(profile.id)) result.set(profile.id, clone(profile));
    return [...result.values()];
}
