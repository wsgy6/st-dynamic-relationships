import { MESSAGE_KEY, STORE_KEY } from './constants.js';
import { migrateState } from './migrations.js';
import { clone, createEmptyState } from './model.js';
import { applyEvents, decayGraph } from './relationship-engine.js';

export class StateStore {
    constructor(contextProvider, settingsProvider) {
        this.contextProvider = contextProvider;
        this.settingsProvider = settingsProvider;
        this.state = createEmptyState();
        this.chatId = null;
    }

    load() {
        const context = this.contextProvider();
        this.chatId = context.chatId ?? context.getCurrentChatId?.() ?? null;
        try {
            this.state = migrateState(context.chatMetadata?.[STORE_KEY]);
        } catch (error) {
            console.error('[动态关系网络] 状态加载失败，保留空状态', error);
            this.state = createEmptyState();
        }
        return this.state;
    }

    async save() {
        const context = this.contextProvider();
        if (this.chatId !== (context.chatId ?? context.getCurrentChatId?.() ?? null)) return;
        this.state.updatedAt = new Date().toISOString();
        context.chatMetadata[STORE_KEY] = clone(this.state);
        await context.saveMetadata();
    }

    async commitEvents(messageIndex, events, warnings = []) {
        const context = this.contextProvider();
        const message = context.chat[messageIndex];
        if (!message) throw new Error(`消息 ${messageIndex} 不存在`);
        const sourceFingerprint = fingerprintMessage(message, messageIndex);
        const previousSnapshotId = this.state.snapshots.at(-1)?.id ?? null;
        decayGraph(this.state.graph);
        const result = applyEvents(this.state.graph, events);
        const snapshotId = createSnapshotId(sourceFingerprint);
        const update = {
            previous_snapshot_id: previousSnapshotId,
            source_message_id: String(messageIndex),
            source_fingerprint: sourceFingerprint,
            source_turn_index: messageIndex,
            extracted_events: clone(events),
            deterministic_changes: result.deterministicChanges,
            rejected_changes: result.rejectedChanges,
            validation_warnings: warnings,
            resulting_snapshot_id: snapshotId,
        };
        message.extra ??= {};
        message.extra[MESSAGE_KEY] = { sourceFingerprint, events: clone(events), snapshotId };
        this.state.events.push(...clone(events));
        this.state.updates.push(update);
        this.state.snapshots.push({ id: snapshotId, messageIndex, sourceFingerprint, graph: clone(this.state.graph) });
        this.enforceLimits();
        await this.save();
        await context.saveChat();
        return update;
    }

    async rebuildFromMessages(pendingRebuildFrom = null) {
        const context = this.contextProvider();
        const graph = clone(this.state.initialGraph);
        const events = [];
        const updates = [];
        const snapshots = [];
        for (let index = 0; index < context.chat.length; index++) {
            const record = context.chat[index]?.extra?.[MESSAGE_KEY];
            if (!record?.events?.length) continue;
            const currentFingerprint = fingerprintMessage(context.chat[index], index);
            if (record.sourceFingerprint !== currentFingerprint) continue;
            decayGraph(graph);
            const result = applyEvents(graph, record.events);
            const snapshotId = createSnapshotId(currentFingerprint);
            events.push(...clone(record.events));
            updates.push({
                previous_snapshot_id: snapshots.at(-1)?.id ?? null,
                source_message_id: String(index), source_fingerprint: currentFingerprint, source_turn_index: index,
                extracted_events: clone(record.events), deterministic_changes: result.deterministicChanges,
                rejected_changes: result.rejectedChanges, validation_warnings: [], resulting_snapshot_id: snapshotId,
            });
            snapshots.push({ id: snapshotId, messageIndex: index, sourceFingerprint: currentFingerprint, graph: clone(graph) });
        }
        this.state.graph = graph;
        this.state.events = events;
        this.state.updates = updates;
        this.state.snapshots = snapshots;
        this.state.pendingRebuildFrom = pendingRebuildFrom;
        this.enforceLimits();
        await this.save();
    }

    findDivergenceIndex(fallbackIndex = null) {
        for (const update of this.state.updates) {
            const index = update.source_turn_index;
            const message = this.contextProvider().chat[index];
            if (!message || fingerprintMessage(message, index) !== update.source_fingerprint) return index;
        }
        return fallbackIndex;
    }

    clearMessageEventsFrom(index) {
        const chat = this.contextProvider().chat;
        for (let messageIndex = index; messageIndex < chat.length; messageIndex++) {
            if (chat[messageIndex]?.extra) delete chat[messageIndex].extra[MESSAGE_KEY];
        }
    }

    async rollbackLastUpdate() {
        const lastUpdate = this.state.updates.at(-1);
        if (!lastUpdate) return false;
        const index = lastUpdate.source_turn_index;
        const message = this.contextProvider().chat[index];
        if (message?.extra) delete message.extra[MESSAGE_KEY];
        await this.rebuildFromMessages();
        await this.contextProvider().saveChat();
        return true;
    }

    async setInitialGraph(graph) {
        this.state.graph = clone(graph);
        this.state.initialGraph = clone(graph);
        this.state.events = [];
        this.state.updates = [];
        this.state.snapshots = [];
        await this.save();
    }

    async reset() {
        this.state = createEmptyState();
        await this.save();
    }

    exportState() {
        return JSON.stringify(this.state, null, 2);
    }

    async importState(raw) {
        this.state = migrateState(typeof raw === 'string' ? JSON.parse(raw) : raw);
        await this.save();
    }

    enforceLimits() {
        const settings = this.settingsProvider();
        this.state.events = this.state.events.slice(-settings.maxEvents);
        this.state.updates = this.state.updates.slice(-settings.maxSnapshots);
        this.state.snapshots = this.state.snapshots.slice(-settings.maxSnapshots);
    }
}

export function fingerprintMessage(message, index) {
    const text = [index, message?.name ?? '', message?.is_user ? 'user' : 'assistant', message?.mes ?? '', message?.swipe_id ?? 0].join('|');
    let hash = 2166136261;
    for (let i = 0; i < text.length; i++) {
        hash ^= text.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
}

function createSnapshotId(fingerprint) {
    return `${Date.now().toString(36)}-${fingerprint}`;
}
