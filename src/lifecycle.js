import { buildInitialGraph } from './character-definition.js';
import { EventExtractor } from './event-extractor.js';
import { buildRelationshipPrompt } from './prompt-injector.js';

export class RelationshipLifecycle {
    constructor(contextProvider, store, settingsProvider, panel) {
        this.contextProvider = contextProvider;
        this.store = store;
        this.settingsProvider = settingsProvider;
        this.panel = panel;
        this.extractor = new EventExtractor(contextProvider, settingsProvider);
        this.bound = false;
    }

    async initialize() {
        this.store.load();
        if (!Object.keys(this.store.state.graph.nodes).length) await this.store.setInitialGraph(buildInitialGraph(this.contextProvider()));
        this.bindEvents();
        this.panel.render(this.store.state);
    }

    bindEvents() {
        if (this.bound) return;
        const context = this.contextProvider();
        const types = context.eventTypes;
        context.eventSource.on(types.CHAT_CHANGED, () => this.handleChatChanged());
        context.eventSource.on(types.MESSAGE_RECEIVED, index => this.queueMessage(index));
        context.eventSource.on(types.MESSAGE_EDITED, index => this.handleMutation(index));
        context.eventSource.on(types.MESSAGE_UPDATED, index => this.handleMutation(index));
        context.eventSource.on(types.MESSAGE_DELETED, length => this.handleDeletion(Number(length)));
        context.eventSource.on(types.MESSAGE_SWIPED, index => this.handleMutation(index));
        this.bound = true;
    }

    queueMessage(index) {
        setTimeout(() => void this.handleMessage(index), 0);
    }

    refreshInjection() {
        const context = this.contextProvider();
        const settings = this.settingsProvider();
        if (!settings.enabled) return;
        const prompt = buildRelationshipPrompt(this.store.state, settings.promptBudget);
        context.setExtensionPrompt('st_dynamic_relationships_prompt', prompt, 1, settings.promptDepth, false, 0);
    }

    async handleChatChanged() {
        this.store.load();
        if (!Object.keys(this.store.state.graph.nodes).length) await this.store.setInitialGraph(buildInitialGraph(this.contextProvider()));
        this.refreshInjection();
        this.panel.render(this.store.state);
    }

    async handleMessage(index) {
        const settings = this.settingsProvider();
        if (!settings.enabled || !settings.autoExtract || !Number.isInteger(index)) return;
        const context = this.contextProvider();
        const message = context.chat[index];
        if (!message?.mes || message.extra?.st_dynamic_relationships) return;
        const result = await this.extractor.extract(index, this.store.state.graph);
        if (!result.valid) {
            this.panel.setStatus(`事件抽取未提交：${result.errors.join('；')}`);
            return;
        }
        if (result.events.length) await this.store.commitEvents(index, result.events, result.errors);
        if (this.store.state.pendingRebuildFrom === index && index === context.chat.length - 1) {
            this.store.state.pendingRebuildFrom = null;
            await this.store.save();
        }
        this.refreshInjection();
        this.panel.render(this.store.state);
    }

    async handleMutation(index) {
        const rebuildIndex = Math.max(0, Number(index) || 0);
        this.store.clearMessageEventsFrom(rebuildIndex);
        await this.store.rebuildFromMessages(rebuildIndex);
        this.refreshInjection();
        this.panel.render(this.store.state);
    }

    async handleDeletion(length) {
        const rebuildIndex = this.store.findDivergenceIndex(length);
        if (rebuildIndex === null) return;
        this.store.clearMessageEventsFrom(rebuildIndex);
        await this.store.rebuildFromMessages(rebuildIndex);
        this.refreshInjection();
        this.panel.setStatus(`消息历史已变化；从第 ${rebuildIndex} 层起需要重新抽取。`);
        this.panel.render(this.store.state);
    }

    async reExtractPending() {
        const start = this.store.state.pendingRebuildFrom;
        if (start === null) return;
        const context = this.contextProvider();
        this.store.state.pendingRebuildFrom = null;
        for (let index = start; index < context.chat.length; index++) {
            const message = context.chat[index];
            if (!message?.mes || message.is_user) continue;
            const result = await this.extractor.extract(index, this.store.state.graph);
            if (!result.valid) {
                this.store.state.pendingRebuildFrom = index;
                await this.store.save();
                throw new Error(result.errors.join('；'));
            }
            if (result.events.length) await this.store.commitEvents(index, result.events, result.errors);
        }
        await this.store.save();
        this.refreshInjection();
    }
}
