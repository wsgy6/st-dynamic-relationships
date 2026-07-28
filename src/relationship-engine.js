import { clampEdge, edgeKey, ensureEdge } from './model.js';

const EFFECTS = {
    meaningful_conversation: { familiarity: 4, affinity: 3, respect: 1, perceived_interest: 1 },
    support: { trust: 6, affinity: 4, intimacy: 2, respect: 3 },
    vulnerability: { trust: 5, intimacy: 6, affinity: 2, fear: 1 },
    shared_success: { affinity: 4, trust: 3, respect: 5, familiarity: 2 },
    rescue: { trust: 8, respect: 6, intimacy: 2, dependency: 2, fear: 1 },
    gift: { affinity: 3, perceived_interest: 3, familiarity: 1 },
    flirtation: { attraction: 5, affinity: 2, perceived_interest: 6 },
    confession: { attraction: 3, perceived_interest: 12, intimacy: 2, fear: 2 },
    date: { familiarity: 3, affinity: 5, attraction: 4, intimacy: 3, perceived_interest: 4 },
    physical_affection: { attraction: 5, intimacy: 5, perceived_interest: 3 },
    rejection: { affinity: -5, attraction: -3, resentment: 5, fear: 2, perceived_interest: -10 },
    humiliation: { affinity: -8, trust: -7, respect: -8, resentment: 10, fear: 4 },
    lie: { trust: -8, respect: -4, resentment: 5, fear: 2 },
    betrayal: { trust: -15, respect: -10, commitment: -8, resentment: 15, fear: 5 },
    neglect: { affinity: -4, intimacy: -3, commitment: -4, resentment: 4 },
    rivalry: { jealousy: 6, resentment: 4, affinity: -2 },
    jealousy_trigger: { jealousy: 10, fear: 3, resentment: 2 },
    boundary_respected: { trust: 5, respect: 5, fear: -3 },
    boundary_violated: { trust: -12, respect: -12, fear: 10, resentment: 9, attraction: -4 },
    rumor: { perceived_interest: 2, fear: 1 },
    discovery: { trust: -3, respect: -2, fear: 2 },
    breakup: { commitment: -18, affinity: -8, intimacy: -8, resentment: 5, fear: 3 },
    reconciliation: { affinity: 4, trust: 3, intimacy: 3, resentment: -5, commitment: 2 },
    commitment: { commitment: 12, trust: 5, intimacy: 4, perceived_interest: 4 },
};

const POSITIVE_EVENTS = new Set(['support', 'vulnerability', 'shared_success', 'rescue', 'gift', 'flirtation', 'date', 'physical_affection', 'boundary_respected', 'reconciliation', 'commitment']);
const NEGATIVE_EVENTS = new Set(['rejection', 'humiliation', 'lie', 'betrayal', 'neglect', 'rivalry', 'jealousy_trigger', 'boundary_violated', 'breakup']);

export function applyEvents(graph, events) {
    const deterministicChanges = [];
    const rejectedChanges = [];
    for (const event of events) {
        const result = applyEvent(graph, event);
        deterministicChanges.push(...result.changes);
        rejectedChanges.push(...result.rejected);
    }
    refreshCrushes(graph);
    return { deterministicChanges, rejectedChanges };
}

export function applyEvent(graph, event) {
    const changes = [];
    const rejected = [];
    const observers = getObservers(event);
    const targetIds = unique([event.initiator, event.target, ...observers]);
    for (const sourceId of targetIds) {
        for (const targetId of targetIds) {
            if (sourceId === targetId) continue;
            const role = resolveRole(sourceId, targetId, event);
            if (!role) continue;
            const edge = ensureEdge(graph, sourceId, targetId);
            const source = graph.nodes[sourceId];
            const multiplier = calculateMultiplier(source, event, role);
            const effect = effectForRole(event, role, edge);
            const applied = applyEffect(edge, effect, multiplier, event);
            if (applied.length) changes.push({ eventId: event.event_id, sourceId, targetId, changes: applied });
            if (!applied.length && Object.keys(effect).length) rejected.push({ eventId: event.event_id, sourceId, targetId, reason: '字段已锁定或事件无可用变更' });
            advanceLabels(edge, event, role);
        }
    }
    return { changes, rejected };
}

function getObservers(event) {
    if (event.publicity === 'public') return event.witnesses.filter(id => !event.participants.includes(id));
    if (event.publicity === 'witnessed') return event.witnesses.filter(id => !event.participants.includes(id));
    return [];
}

function resolveRole(sourceId, targetId, event) {
    const isInitiator = sourceId === event.initiator;
    const isTarget = sourceId === event.target;
    if (isInitiator && targetId === event.target) return 'initiator';
    if (isTarget && targetId === event.initiator) return 'target';
    if (!event.participants.includes(sourceId) && event.participants.includes(targetId)) return 'observer';
    return null;
}

function effectForRole(event, role, edge) {
    const base = EFFECTS[event.event_type] ?? {};
    if (role === 'initiator') return base;
    if (role === 'target') return mirrorEffect(base, event.event_type);
    if (role === 'observer') return observerEffect(event.event_type, edge);
    return {};
}

function mirrorEffect(effect, type) {
    const mirrored = { ...effect };
    if (type === 'flirtation') return { familiarity: 1, perceived_interest: 6 };
    if (type === 'confession') return { familiarity: 1, perceived_interest: 16, fear: 2 };
    if (type === 'rejection') mirrored.perceived_interest = -2;
    if (type === 'gift') mirrored.perceived_interest = 5;
    return mirrored;
}

function observerEffect(type, edge) {
    if (type === 'rumor') return { perceived_interest: 3, fear: 1 };
    if (type === 'flirtation' || type === 'date' || type === 'physical_affection') {
        const hasRomanticStake = edge.attraction >= 25 || edge.commitment >= 20 || edge.romantic_intent !== 'none';
        return hasRomanticStake ? { jealousy: 3, perceived_interest: 2 } : { familiarity: 1 };
    }
    if (type === 'betrayal' || type === 'boundary_violated') return { respect: -3, fear: 2 };
    return {};
}

function calculateMultiplier(character, event, role) {
    let multiplier = event.intensity;
    if (POSITIVE_EVENTS.has(event.event_type)) multiplier *= 0.55 + character.emotionalAvailability / 100 * 0.45;
    if (NEGATIVE_EVENTS.has(event.event_type)) multiplier *= 0.75 + (100 - character.riskTolerance) / 400;
    if (event.event_type === 'flirtation' || event.event_type === 'confession') multiplier *= 0.6 + character.riskTolerance / 250;
    if (role === 'observer') multiplier *= 0.35;
    return Math.max(0.12, Math.min(1.25, multiplier));
}

function applyEffect(edge, effect, multiplier, event) {
    const applied = [];
    for (const [field, delta] of Object.entries(effect)) {
        if (edge.lockedFields.includes(field)) continue;
        const amount = round(delta * multiplier);
        if (!amount) continue;
        const previous = edge[field];
        edge[field] += amount;
        applied.push({ field, previous, current: edge[field], delta: amount });
    }
    if (applied.length) {
        if (!edge.lockedFields.includes('momentum')) edge.momentum = Math.max(-100, Math.min(100, round(edge.momentum * 0.6 + signedMomentum(applied))));
        edge.last_meaningful_event = event.evidence_summary;
        if (!edge.evidence.includes(event.event_id)) edge.evidence.push(event.event_id);
        if (edge.evidence.length > 20) edge.evidence.shift();
    }
    clampEdge(edge);
    return applied;
}

function advanceLabels(edge, event, role) {
    if (role === 'observer') return;
    if (event.event_type === 'breakup') {
        edge.public_status = 'exes';
        edge.romantic_intent = 'withdrawing';
        edge.private_feeling = edge.resentment > 35 ? 'hostile' : 'disillusioned';
        return;
    }
    if (event.event_type === 'commitment' && edge.trust >= 35 && edge.affinity >= 15) {
        edge.romantic_intent = 'committed';
        edge.public_status = 'partners';
        edge.exclusivity_expectation = 'explicit';
        edge.private_feeling = 'attached';
        return;
    }
    if (edge.attraction >= 45 && edge.trust >= 25 && edge.affinity >= 15 && edge.romantic_intent === 'none') edge.romantic_intent = 'curious';
    if (edge.attraction >= 55 && edge.trust >= 35 && edge.affinity >= 25 && edge.romantic_intent === 'curious') edge.romantic_intent = 'interested';
    if (edge.attraction >= 65 && edge.trust >= 45 && edge.affinity >= 35 && edge.romantic_intent === 'interested') edge.romantic_intent = 'pursuing';
    if (edge.attraction >= 45 && edge.affinity >= 15) edge.private_feeling = edge.intimacy >= 45 ? 'attached' : 'attracted';
    if (edge.resentment >= 55 || edge.fear >= 60) edge.private_feeling = 'disillusioned';
    if (event.event_type === 'rejection' && edge.romantic_intent !== 'committed') edge.romantic_intent = 'withdrawing';
}

export function decayGraph(graph) {
    for (const edge of Object.values(graph.edges)) {
        if (!edge.lockedFields.includes('momentum')) edge.momentum = round(edge.momentum * 0.72);
        if (!edge.lockedFields.includes('jealousy')) edge.jealousy = Math.max(0, round(edge.jealousy - 0.5));
        if (!edge.lockedFields.includes('fear')) edge.fear = Math.max(0, round(edge.fear - 0.25));
        clampEdge(edge);
    }
}

export function refreshCrushes(graph) {
    for (const node of Object.values(graph.nodes)) {
        const candidates = Object.values(graph.edges)
            .filter(edge => edge.sourceId === node.id)
            .map(edge => ({ edge, strength: crushStrength(edge) }))
            .filter(candidate => candidate.strength >= 20)
            .sort((a, b) => b.strength - a.strength)
            .slice(0, 3);
        node.currentCrushes = candidates.map(candidate => ({ targetId: candidate.edge.targetId, strength: candidate.strength, kind: candidate.edge.private_feeling }));
        node.primaryAttachment = candidates[0]?.edge.targetId ?? null;
    }
}

export function rankRomanticCandidates(graph, actorId) {
    const actor = graph.nodes[actorId];
    if (!actor) return [];
    return Object.values(graph.edges)
        .filter(edge => edge.sourceId === actorId && edge.targetId !== actorId)
        .filter(edge => isEligibleCandidate(actor, graph.nodes[edge.targetId]))
        .map(edge => ({
            targetId: edge.targetId,
            score: round(
                edge.compatibility * 0.28 + edge.attraction * 0.25 + edge.trust * 0.16 +
                Math.max(edge.affinity, -40) * 0.16 + edge.intimacy * 0.1 + edge.respect * 0.08 -
                edge.resentment * 0.22 - edge.fear * 0.12
            ),
        }))
        .sort((left, right) => right.score - left.score);
}

export function isEligibleCandidate(actor, target) {
    if (!actor || !target) return false;
    const constraints = actor.orientationConstraints.map(item => item.trim()).filter(Boolean);
    if (!constraints.length) return true;
    const targetTags = new Set([target.id, ...target.identityTags, ...target.aliases].map(item => item.toLowerCase()));
    const exclusions = constraints.filter(item => item.toLowerCase().startsWith('exclude:')).map(item => item.slice(item.indexOf(':') + 1).trim().toLowerCase());
    if (exclusions.some(item => targetTags.has(item))) return false;
    const inclusions = constraints.filter(item => item.toLowerCase().startsWith('include:')).map(item => item.slice(item.indexOf(':') + 1).trim().toLowerCase());
    return !inclusions.length || inclusions.some(item => targetTags.has(item));
}

export function evaluatePursuitDecision(graph, actorId, targetId) {
    const actor = graph.nodes[actorId];
    const candidate = getEdge(graph, actorId, targetId);
    if (!actor || !candidate) return { action: 'unavailable', reason: '角色或关系边不存在' };
    if (actor.emotionalAvailability < 20) return { action: 'wait', reason: '当前情感可用性过低' };
    const committedEdge = Object.values(graph.edges).find(edge => edge.sourceId === actorId && edge.targetId !== targetId && edge.romantic_intent === 'committed');
    if (!committedEdge) return { action: candidate.attraction >= 35 ? 'pursue' : 'wait', reason: '没有排他承诺冲突' };
    const loyalty = actor.loyaltyModel.toLowerCase();
    const strict = loyalty.includes('strict') || loyalty.includes('monogamous') || loyalty.includes('忠诚') || loyalty.includes('排他');
    const open = loyalty.includes('open') || loyalty.includes('poly') || loyalty.includes('开放') || loyalty.includes('多偶');
    if (open) return { action: 'pursue_openly', reason: '忠诚模型允许协商后的多重关系' };
    const newScore = rankRomanticCandidates(graph, actorId).find(item => item.targetId === targetId)?.score ?? -100;
    const oldScore = rankRomanticCandidates(graph, actorId).find(item => item.targetId === committedEdge.targetId)?.score ?? -100;
    if (strict && newScore > oldScore + 15) return { action: 'breakup_first', reason: '排他忠诚要求先结束原关系' };
    if (strict) return { action: 'maintain_commitment', reason: '现有承诺优先且新关系优势不足' };
    const secrecyPressure = actor.riskTolerance + (actor.attachmentStyle.toLowerCase().includes('avoid') ? 15 : 0);
    if (secrecyPressure >= 70 && newScore > oldScore) return { action: 'secret_pursuit', reason: '风险偏好与依恋模式允许隐瞒' };
    return { action: 'withdraw', reason: '承诺冲突且不愿承担秘密关系风险' };
}

function crushStrength(edge) {
    return Math.max(0, round(edge.attraction * 0.45 + Math.max(edge.affinity, 0) * 0.22 + edge.intimacy * 0.16 + edge.trust * 0.1 - edge.resentment * 0.25 - edge.fear * 0.12));
}

function signedMomentum(changes) {
    return changes.reduce((total, change) => total + change.delta, 0) / Math.max(1, changes.length);
}

function unique(values) {
    return [...new Set(values)];
}

function round(value) {
    return Math.round(value * 10) / 10;
}

export const getEdge = (graph, sourceId, targetId) => graph.edges[edgeKey(sourceId, targetId)];
