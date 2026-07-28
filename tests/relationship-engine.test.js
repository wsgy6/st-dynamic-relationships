import assert from 'node:assert/strict';
import test from 'node:test';
import { createCharacterNode, createRelationshipEdge, edgeKey } from '../src/model.js';
import { applyEvents, evaluatePursuitDecision, getEdge, isEligibleCandidate, rankRomanticCandidates } from '../src/relationship-engine.js';

function graphWith(...nodes) {
    return { nodes: Object.fromEntries(nodes.map(node => [node.id, node])), edges: {} };
}

function event(overrides = {}) {
    return {
        event_id: 'event-1', turn_index: 1, scene_id: 'scene', participants: ['A', 'B'], witnesses: [],
        event_type: 'flirtation', initiator: 'A', target: 'B', intensity: 1, publicity: 'private',
        interpretation: { A: '试探', B: '暧昧' }, tags: [], evidence_summary: 'A 对 B 调情', ...overrides,
    };
}

test('A 喜欢 B 不会自动让 B 喜欢 A', () => {
    const graph = graphWith(createCharacterNode('A'), createCharacterNode('B'));
    applyEvents(graph, [event()]);
    const aToB = getEdge(graph, 'A', 'B');
    const bToA = getEdge(graph, 'B', 'A');
    assert.notEqual(aToB, bToA);
    assert.ok(aToB.attraction > 0);
    assert.equal(bToA.attraction, 0);
    assert.equal(bToA.romantic_intent, 'none');
});

test('NPC 可以成功追求 NPC', () => {
    const graph = graphWith(createCharacterNode('A'), createCharacterNode('B'));
    const events = [];
    for (let index = 0; index < 8; index++) {
        events.push(event({ event_id: `a${index}`, event_type: 'date', intensity: 1 }));
        events.push(event({ event_id: `b${index}`, event_type: 'support', initiator: 'B', target: 'A', intensity: 1 }));
    }
    events.push(event({ event_id: 'commit', event_type: 'commitment', intensity: 1 }));
    applyEvents(graph, events);
    const edge = getEdge(graph, 'A', 'B');
    assert.equal(edge.romantic_intent, 'committed');
    assert.equal(edge.public_status, 'partners');
});

test('更合适的竞争者可胜过 user', () => {
    const graph = graphWith(createCharacterNode('N'), createCharacterNode('{{user}}'), createCharacterNode('Rival'));
    graph.edges[edgeKey('N', '{{user}}')] = createRelationshipEdge('N', '{{user}}', { compatibility: 20, attraction: 60, trust: 40, affinity: 20 });
    graph.edges[edgeKey('N', 'Rival')] = createRelationshipEdge('N', 'Rival', { compatibility: 80, attraction: 70, trust: 70, affinity: 60 });
    assert.equal(rankRomanticCandidates(graph, 'N')[0].targetId, 'Rival');
});

test('可同时持有多种感情对象', () => {
    const graph = graphWith(createCharacterNode('A'), createCharacterNode('B'), createCharacterNode('C'));
    graph.edges[edgeKey('A', 'B')] = createRelationshipEdge('A', 'B', { attraction: 75, affinity: 40, trust: 30 });
    graph.edges[edgeKey('A', 'C')] = createRelationshipEdge('A', 'C', { attraction: 40, affinity: 80, trust: 80, intimacy: 55 });
    applyEvents(graph, []);
    assert.equal(graph.nodes.A.currentCrushes.length, 2);
    assert.notEqual(graph.nodes.A.currentCrushes[0].targetId, graph.nodes.A.currentCrushes[1].targetId);
});

test('移情不能一轮完成', () => {
    const graph = graphWith(createCharacterNode('A'), createCharacterNode('B'));
    applyEvents(graph, [event({ event_type: 'flirtation', intensity: 1 })]);
    assert.notEqual(getEdge(graph, 'A', 'B').romantic_intent, 'committed');
});

test('忠诚模型决定先分手还是秘密追求', () => {
    const strictActor = createCharacterNode('A', 'A', { loyaltyModel: 'strict monogamous', emotionalAvailability: 80 });
    const graph = graphWith(strictActor, createCharacterNode('B'), createCharacterNode('C'));
    graph.edges[edgeKey('A', 'B')] = createRelationshipEdge('A', 'B', { romantic_intent: 'committed', compatibility: 25, attraction: 40, trust: 45, affinity: 30 });
    graph.edges[edgeKey('A', 'C')] = createRelationshipEdge('A', 'C', { compatibility: 90, attraction: 80, trust: 80, affinity: 70 });
    assert.equal(evaluatePursuitDecision(graph, 'A', 'C').action, 'breakup_first');
    graph.nodes.A.loyaltyModel = 'contextual';
    graph.nodes.A.riskTolerance = 90;
    graph.nodes.A.attachmentStyle = 'avoidant';
    assert.equal(evaluatePursuitDecision(graph, 'A', 'C').action, 'secret_pursuit');
});

test('传闻不会被当作亲眼所见', () => {
    const graph = graphWith(createCharacterNode('A'), createCharacterNode('B'), createCharacterNode('C'));
    applyEvents(graph, [event({ event_type: 'rumor', participants: ['A', 'B'], witnesses: ['C'], publicity: 'private' })]);
    assert.equal(getEdge(graph, 'C', 'A'), undefined);
});

test('旁观调情不会让无感角色凭空嫉妒', () => {
    const graph = graphWith(createCharacterNode('A'), createCharacterNode('B'), createCharacterNode('C'));
    applyEvents(graph, [event({ witnesses: ['C'], publicity: 'witnessed' })]);
    assert.equal(getEdge(graph, 'C', 'A').jealousy, 0);
});

test('取向使用通用身份标签约束而非性别分支', () => {
    const actor = createCharacterNode('A', 'A', { orientationConstraints: ['include:scholar'] });
    const scholar = createCharacterNode('B', 'B', { identityTags: ['scholar'] });
    const artist = createCharacterNode('C', 'C', { identityTags: ['artist'] });
    assert.equal(isEligibleCandidate(actor, scholar), true);
    assert.equal(isEligibleCandidate(actor, artist), false);
});
