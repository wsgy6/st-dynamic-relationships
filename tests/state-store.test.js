import assert from 'node:assert/strict';
import test from 'node:test';
import { StateStore } from '../src/state-store.js';
import { createCharacterNode } from '../src/model.js';
import { parseAndValidateEventBatch } from '../src/schema.js';

function fakeContext() {
    const context = {
        chatId: 'test-chat', chatMetadata: {}, chat: [{ name: 'A', mes: 'text', is_user: false, extra: {} }],
        async saveMetadata() {}, async saveChat() {},
    };
    return context;
}

function event() {
    return { event_id: 'x', turn_index: 0, scene_id: 's', participants: ['A', 'B'], witnesses: [], event_type: 'support', initiator: 'A', target: 'B', intensity: 1, publicity: 'private', interpretation: {}, tags: [], evidence_summary: 'A 支持 B' };
}

test('删除消息后可由剩余消息重建', async () => {
    const context = fakeContext();
    const store = new StateStore(() => context, () => ({ maxEvents: 300, maxSnapshots: 60 }));
    store.load();
    await store.setInitialGraph({ nodes: { A: createCharacterNode('A'), B: createCharacterNode('B') }, edges: {} });
    await store.commitEvents(0, [event()]);
    assert.equal(store.state.events.length, 1);
    context.chat.length = 0;
    await store.rebuildFromMessages();
    assert.equal(store.state.events.length, 0);
});

test('解析失败不覆盖旧状态', async () => {
    const context = fakeContext();
    const store = new StateStore(() => context, () => ({ maxEvents: 300, maxSnapshots: 60 }));
    store.load();
    await store.setInitialGraph({ nodes: { A: createCharacterNode('A'), B: createCharacterNode('B') }, edges: {} });
    await store.commitEvents(0, [event()]);
    const result = parseAndValidateEventBatch('{bad json', ['A', 'B']);
    assert.equal(result.valid, false);
    assert.equal(store.state.events.length, 1);
});

test('兼容 Prompt Template 的代码块和旧事件字段', () => {
    const result = parseAndValidateEventBatch('```json\n{"events":[{"turn_index":4,"type":"care","subtype":"cooking","participants":["顾清","逸"],"witnesses":[],"summary":"顾清为逸煮面"}]}\n```', [{ id: '顾清', displayName: '顾清' }, { id: '{{user}}', displayName: '逸' }]);
    assert.equal(result.valid, true);
    assert.equal(result.events[0].event_type, 'support');
    assert.equal(result.events[0].initiator, '顾清');
    assert.equal(result.events[0].target, '{{user}}');
});

test('兼容 anchors 关系输出', () => {
    const result = parseAndValidateEventBatch('{"anchors":[{"scene":"家中","edges":[{"s":"顾清","t":"逸","r":"煮面并叮嘱"}],"where":"翰林雅苑"}]}', [{ id: '顾清', displayName: '顾清' }, { id: '{{user}}', displayName: '逸' }]);
    assert.equal(result.valid, true);
    assert.equal(result.events[0].initiator, '顾清');
    assert.equal(result.events[0].target, '{{user}}');
});

test('编辑或重生成后清除受影响事件副本', async () => {
    const context = fakeContext();
    const store = new StateStore(() => context, () => ({ maxEvents: 300, maxSnapshots: 60 }));
    store.load();
    await store.setInitialGraph({ nodes: { A: createCharacterNode('A'), B: createCharacterNode('B') }, edges: {} });
    await store.commitEvents(0, [event()]);
    assert.ok(context.chat[0].extra.st_dynamic_relationships);
    store.clearMessageEventsFrom(0);
    await store.rebuildFromMessages(0);
    assert.equal(context.chat[0].extra.st_dynamic_relationships, undefined);
    assert.equal(store.state.events.length, 0);
    assert.equal(store.state.pendingRebuildFrom, 0);
});

test('手动回滚不会在下次重建时复活', async () => {
    const context = fakeContext();
    const store = new StateStore(() => context, () => ({ maxEvents: 300, maxSnapshots: 60 }));
    store.load();
    await store.setInitialGraph({ nodes: { A: createCharacterNode('A'), B: createCharacterNode('B') }, edges: {} });
    await store.commitEvents(0, [event()]);
    assert.equal(await store.rollbackLastUpdate(), true);
    assert.equal(context.chat[0].extra.st_dynamic_relationships, undefined);
    assert.equal(store.state.events.length, 0);
});
