import { edgeKey } from './model.js';
import { ConnectionManagerRequestService } from '../../../shared.js';

export class RelationshipPanel {
    constructor(contextProvider, settingsProvider, lifecycleProvider) {
        this.contextProvider = contextProvider;
        this.settingsProvider = settingsProvider;
        this.lifecycleProvider = lifecycleProvider;
        this.root = null;
        this.status = '';
        this.viewportSyncBound = false;
        this.dragState = null;
        this.suppressToggleClick = false;
        this.ensureMounted();
    }

    ensureMounted() {
        if (this.root?.isConnected) return;
        this.root = document.createElement('section');
        this.root.id = 'st-dynamic-relationships-panel';
        this.root.dataset.mobileDock = this.settingsProvider().mobileDock || 'auto';
        document.body.append(this.root);
        this.bindViewportSync();
        this.syncViewportPosition();
    }

    render(state) {
        this.ensureMounted();
        const settings = this.settingsProvider();
        this.root.dataset.mobileDock = settings.mobileDock || 'auto';
        const edges = Object.values(state.graph.edges).filter(edge => edge.evidence.length || edge.romantic_intent !== 'none' || edge.public_status !== 'strangers');
        this.root.innerHTML = `
            <button class="stdr-toggle" title="动态关系网络">关系</button>
            <div class="stdr-window" hidden>
                <header><strong>动态关系网络</strong><button class="stdr-close" title="关闭">×</button></header>
                <div class="stdr-actions">
                    <button data-action="initialize">读取角色定义</button>
                    <button data-action="rebuild">从聊天重建</button>
                    <button data-action="rollback">回滚一轮</button>
                    <button data-action="export">导出</button>
                    <label class="stdr-import">导入<input type="file" accept="application/json" hidden></label>
                    <label><input data-setting="debugMode" type="checkbox" ${settings.debugMode ? 'checked' : ''}> 调试</label>
                    <label><input data-setting="autoExtract" type="checkbox" ${settings.autoExtract ? 'checked' : ''}> 自动抽取</label>
                </div>
                ${renderExtractorSettings(settings)}
                <p class="stdr-status">${escapeHtml(this.status || statusText(state, edges.length))}</p>
                <div class="stdr-crushes">${renderCrushes(state)}</div>
                <div class="stdr-list">${edges.map(edge => renderEdge(edge, state, settings.debugMode)).join('') || '<p>暂无已记录关系。读取角色定义后，生成消息会自动抽取事件。</p>'}</div>
            </div>`;
        this.bind(state);
        this.syncViewportPosition();
    }

    bindViewportSync() {
        if (this.viewportSyncBound) return;
        const sync = () => this.syncViewportPosition();
        window.addEventListener('resize', sync, { passive: true });
        window.addEventListener('scroll', sync, { passive: true });
        window.visualViewport?.addEventListener('resize', sync, { passive: true });
        window.visualViewport?.addEventListener('scroll', sync, { passive: true });
        this.viewportSyncBound = true;
    }

    syncViewportPosition() {
        if (!this.root || window.innerWidth > 640) {
            this.root?.style.removeProperty('--stdr-mobile-left');
            this.root?.style.removeProperty('--stdr-mobile-top');
            this.root?.style.removeProperty('--stdr-mobile-input-clearance');
            return;
        }
        const viewport = window.visualViewport;
        const horizontalOffset = viewport?.offsetLeft ?? 0;
        const verticalOffset = viewport?.offsetTop ?? 0;
        this.root.style.setProperty('--stdr-mobile-left', `${window.scrollX + horizontalOffset}px`);
        this.root.style.setProperty('--stdr-mobile-top', `${window.scrollY + verticalOffset}px`);
        this.root.style.setProperty('--stdr-mobile-input-clearance', `${this.getInputClearance()}px`);
        this.applySavedMobilePosition();
    }

    getInputClearance() {
        const inputArea = [...document.querySelectorAll('#send_form, #form_sheld, #chat_send_form, #send_textarea')]
            .map(element => element.closest('form, #send_form, #form_sheld, #chat_send_form') ?? element)
            .find(element => element.getClientRects().length && element.getBoundingClientRect().top < window.innerHeight);
        if (!inputArea) return 68;
        const rect = inputArea.getBoundingClientRect();
        return Math.max(68, Math.round(window.innerHeight - rect.top + 8));
    }

    applySavedMobilePosition() {
        const settings = this.settingsProvider();
        if (settings.mobileDock !== 'custom' || !settings.mobilePosition) {
            this.root.style.removeProperty('--stdr-mobile-drag-left');
            this.root.style.removeProperty('--stdr-mobile-drag-top');
            return;
        }
        this.root.style.setProperty('--stdr-mobile-drag-left', `${settings.mobilePosition.left}px`);
        this.root.style.setProperty('--stdr-mobile-drag-top', `${settings.mobilePosition.top}px`);
    }

    bind(state) {
        const windowElement = this.root.querySelector('.stdr-window');
        const toggle = this.root.querySelector('.stdr-toggle');
        toggle.addEventListener('click', () => {
            if (this.suppressToggleClick) {
                this.suppressToggleClick = false;
                return;
            }
            windowElement.hidden = !windowElement.hidden;
        });
        toggle.addEventListener('pointerdown', event => this.startToggleDrag(event));
        this.root.querySelector('.stdr-close').addEventListener('click', () => { windowElement.hidden = true; });
        this.root.querySelector('[data-action="initialize"]').addEventListener('click', () => this.initializeGraph());
        this.root.querySelector('[data-action="rebuild"]').addEventListener('click', () => this.rebuild());
        this.root.querySelector('[data-action="rollback"]').addEventListener('click', () => this.rollback());
        this.root.querySelector('[data-action="export"]').addEventListener('click', () => this.export());
        this.root.querySelector('.stdr-import input').addEventListener('change', event => this.import(event));
        this.root.querySelectorAll('input[type="checkbox"][data-setting]').forEach(input => input.addEventListener('change', event => this.changeSetting(event)));
        this.root.querySelector('[data-setting="extractionProvider"]')?.addEventListener('change', event => this.changeProvider(event));
        this.root.querySelector('[data-setting="extractionProfileId"]')?.addEventListener('change', event => this.changeProfile(event));
        this.root.querySelector('[data-setting="extractionResponseLength"]')?.addEventListener('change', event => this.changeNumberSetting(event));
        this.root.querySelector('[data-setting="mobileDock"]')?.addEventListener('change', event => this.changeMobileDock(event));
        this.root.querySelectorAll('[data-lock]').forEach(input => input.addEventListener('change', event => this.toggleLock(event)));
        this.root.querySelectorAll('[data-field]').forEach(input => input.addEventListener('change', event => this.editField(event)));
    }

    setStatus(status) {
        this.status = status;
        const element = this.root?.querySelector('.stdr-status');
        if (element) element.textContent = status;
    }

    async initializeGraph() {
        const lifecycle = this.lifecycleProvider();
        const { buildInitialGraph } = await import('./character-definition.js');
        await lifecycle.store.setInitialGraph(buildInitialGraph(this.contextProvider()));
        lifecycle.refreshInjection();
        this.setStatus('已读取当前角色卡与 Character Book 定义。');
        this.render(lifecycle.store.state);
    }

    async rebuild() {
        const lifecycle = this.lifecycleProvider();
        try {
            if (lifecycle.store.state.pendingRebuildFrom !== null) await lifecycle.reExtractPending();
            else await lifecycle.store.rebuildFromMessages();
            lifecycle.refreshInjection();
            this.setStatus('已从聊天重建关系状态。');
            this.render(lifecycle.store.state);
        } catch (error) {
            this.setStatus(`重建中断：${error.message}`);
        }
    }

    async rollback() {
        const lifecycle = this.lifecycleProvider();
        if (!await lifecycle.store.rollbackLastUpdate()) return this.setStatus('没有可回滚的上一轮更新。');
        lifecycle.refreshInjection();
        this.setStatus('已回滚最近一轮状态更新。');
        this.render(lifecycle.store.state);
    }

    export() {
        const lifecycle = this.lifecycleProvider();
        const blob = new Blob([lifecycle.store.exportState()], { type: 'application/json' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `dynamic-relationships-${Date.now()}.json`;
        link.click();
        URL.revokeObjectURL(link.href);
    }

    async import(event) {
        const file = event.target.files?.[0];
        if (!file) return;
        try {
            await this.lifecycleProvider().store.importState(await file.text());
            this.setStatus('已导入并迁移状态。');
            this.render(this.lifecycleProvider().store.state);
        } catch (error) {
            this.setStatus(`导入失败：${error.message}`);
        }
    }

    changeSetting(event) {
        const settings = this.settingsProvider();
        settings[event.target.dataset.setting] = event.target.checked;
        this.contextProvider().saveSettingsDebounced();
    }

    changeProvider(event) {
        const settings = this.settingsProvider();
        settings.extractionProvider = event.target.value;
        this.contextProvider().saveSettingsDebounced();
        this.render(this.lifecycleProvider().store.state);
    }

    changeProfile(event) {
        this.settingsProvider().extractionProfileId = event.target.value;
        this.contextProvider().saveSettingsDebounced();
        this.render(this.lifecycleProvider().store.state);
    }

    changeNumberSetting(event) {
        const value = Math.max(128, Math.min(4096, Number(event.target.value) || 900));
        this.settingsProvider().extractionResponseLength = value;
        event.target.value = String(value);
        this.contextProvider().saveSettingsDebounced();
    }

    changeMobileDock(event) {
        const settings = this.settingsProvider();
        settings.mobileDock = event.target.value;
        if (settings.mobileDock !== 'custom') settings.mobilePosition = null;
        this.root.dataset.mobileDock = settings.mobileDock;
        this.contextProvider().saveSettingsDebounced();
        this.syncViewportPosition();
    }

    startToggleDrag(event) {
        if (window.innerWidth > 640 || (event.pointerType === 'mouse' && event.button !== 0)) return;
        const toggle = event.currentTarget;
        const rect = toggle.getBoundingClientRect();
        this.dragState = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, offsetX: event.clientX - rect.left, offsetY: event.clientY - rect.top, moved: false };
        toggle.setPointerCapture?.(event.pointerId);
        const move = moveEvent => this.moveToggleDrag(moveEvent, toggle);
        const end = endEvent => this.endToggleDrag(endEvent, toggle, move, end);
        toggle.addEventListener('pointermove', move);
        toggle.addEventListener('pointerup', end);
        toggle.addEventListener('pointercancel', end);
    }

    moveToggleDrag(event, toggle) {
        const drag = this.dragState;
        if (!drag || event.pointerId !== drag.pointerId) return;
        const moved = Math.abs(event.clientX - drag.startX) > 6 || Math.abs(event.clientY - drag.startY) > 6;
        if (!moved && !drag.moved) return;
        drag.moved = true;
        event.preventDefault();
        const maximumLeft = Math.max(8, window.innerWidth - toggle.offsetWidth - 8);
        const maximumTop = Math.max(8, window.innerHeight - this.getInputClearance() - toggle.offsetHeight - 8);
        const left = Math.max(8, Math.min(maximumLeft, Math.round(event.clientX - drag.offsetX)));
        const top = Math.max(8, Math.min(maximumTop, Math.round(event.clientY - drag.offsetY)));
        this.root.dataset.mobileDock = 'custom';
        this.root.style.setProperty('--stdr-mobile-drag-left', `${left}px`);
        this.root.style.setProperty('--stdr-mobile-drag-top', `${top}px`);
    }

    endToggleDrag(event, toggle, move, end) {
        const drag = this.dragState;
        if (!drag || event.pointerId !== drag.pointerId) return;
        toggle.removeEventListener('pointermove', move);
        toggle.removeEventListener('pointerup', end);
        toggle.removeEventListener('pointercancel', end);
        toggle.releasePointerCapture?.(event.pointerId);
        if (drag.moved) {
            const settings = this.settingsProvider();
            settings.mobileDock = 'custom';
            settings.mobilePosition = {
                left: Number.parseInt(this.root.style.getPropertyValue('--stdr-mobile-drag-left'), 10),
                top: Number.parseInt(this.root.style.getPropertyValue('--stdr-mobile-drag-top'), 10),
            };
            this.contextProvider().saveSettingsDebounced();
            this.suppressToggleClick = true;
        }
        this.dragState = null;
    }

    async toggleLock(event) {
        const lifecycle = this.lifecycleProvider();
        const edge = lifecycle.store.state.graph.edges[event.target.dataset.edge];
        if (!edge) return;
        const field = event.target.dataset.lock;
        if (event.target.checked && !edge.lockedFields.includes(field)) edge.lockedFields.push(field);
        if (!event.target.checked) edge.lockedFields = edge.lockedFields.filter(item => item !== field);
        await lifecycle.store.save();
    }

    async editField(event) {
        const lifecycle = this.lifecycleProvider();
        const edge = lifecycle.store.state.graph.edges[event.target.dataset.edge];
        if (!edge) return;
        const field = event.target.dataset.field;
        const value = Number(event.target.value);
        if (!Number.isFinite(value)) return;
        edge[field] = value;
        if (!edge.lockedFields.includes(field)) edge.lockedFields.push(field);
        await lifecycle.store.save();
        lifecycle.refreshInjection();
    }
}

function renderEdge(edge, state, debugMode) {
    const source = state.graph.nodes[edge.sourceId]?.displayName ?? edge.sourceId;
    const target = state.graph.nodes[edge.targetId]?.displayName ?? edge.targetId;
    const key = edgeKey(edge.sourceId, edge.targetId);
    const debug = debugMode ? `<details><summary>数值与校正</summary>${renderDebug(edge, key)}</details>` : '';
    return `<article class="stdr-edge"><strong>${escapeHtml(source)} → ${escapeHtml(target)}</strong><span>${escapeHtml(edge.private_feeling)} / ${escapeHtml(edge.romantic_intent)} / ${escapeHtml(edge.public_status)}</span><small>${escapeHtml(edge.last_meaningful_event || '尚无关键事件')}</small>${debug}</article>`;
}

function renderExtractorSettings(settings) {
    const profiles = getProfiles();
    const options = profiles.map(profile => `<option value="${escapeAttribute(profile.id)}" ${profile.id === settings.extractionProfileId ? 'selected' : ''}>${escapeHtml(profile.name || profile.model || profile.id)} · ${escapeHtml(profile.model || profile.api)}</option>`).join('');
    const profileDisabled = settings.extractionProvider !== 'profile' ? 'disabled' : '';
    return `<fieldset class="stdr-extractor"><legend>事件抽取 AI</legend>
        <label>调用方式<select data-setting="extractionProvider"><option value="main" ${settings.extractionProvider !== 'profile' ? 'selected' : ''}>当前主 API</option><option value="profile" ${settings.extractionProvider === 'profile' ? 'selected' : ''}>独立连接档案</option></select></label>
        <label>连接档案<select data-setting="extractionProfileId" ${profileDisabled}><option value="">请选择</option>${options}</select></label>
        <label>最大输出 token<input data-setting="extractionResponseLength" type="number" min="128" max="4096" step="64" value="${settings.extractionResponseLength}"></label>
        <label><input data-setting="isolateExtractionPreset" type="checkbox" ${settings.isolateExtractionPreset ? 'checked' : ''}> 隔离酒馆预设与指令模板</label>
        <small>${profiles.length ? '密钥和 API 地址由 SillyTavern Connection Manager 管理，本扩展只保存档案 ID。' : '没有可用连接档案；请先在 SillyTavern 连接管理器中创建。'}</small>
    </fieldset>${renderMobileSettings(settings)}`;
}

function renderMobileSettings(settings) {
    return `<fieldset class="stdr-mobile-settings"><legend>移动端入口</legend>
        <label>停靠位置<select data-setting="mobileDock"><option value="auto" ${settings.mobileDock === 'auto' ? 'selected' : ''}>自动避让输入区</option><option value="bottom-right" ${settings.mobileDock === 'bottom-right' ? 'selected' : ''}>右下</option><option value="bottom-left" ${settings.mobileDock === 'bottom-left' ? 'selected' : ''}>左下</option><option value="top-right" ${settings.mobileDock === 'top-right' ? 'selected' : ''}>右上</option><option value="top-left" ${settings.mobileDock === 'top-left' ? 'selected' : ''}>左上</option><option value="custom" ${settings.mobileDock === 'custom' ? 'selected' : ''}>自定义拖动位置</option></select></label>
        <small>长按并拖动“关系”入口可保存自定义位置；自动和底部停靠会避开酒馆输入区。</small>
    </fieldset>`;
}

function getProfiles() {
    try {
        return ConnectionManagerRequestService.getSupportedProfiles();
    } catch {
        return [];
    }
}

function renderCrushes(state) {
    const rows = Object.values(state.graph.nodes).filter(node => node.currentCrushes.length).map(node => {
        const targets = node.currentCrushes.map(crush => `${state.graph.nodes[crush.targetId]?.displayName ?? crush.targetId}（${crush.kind}）`).join('、');
        return `<div><strong>${escapeHtml(node.displayName)}</strong><span>${escapeHtml(targets)}</span></div>`;
    });
    return rows.length ? `<h3>当前心仪对象</h3>${rows.join('')}` : '';
}

function renderDebug(edge, key) {
    const fields = ['familiarity', 'affinity', 'attraction', 'trust', 'respect', 'intimacy', 'commitment', 'dependency', 'jealousy', 'resentment', 'fear', 'compatibility', 'perceived_interest', 'secrecy', 'momentum'];
    return `<div class="stdr-debug">${fields.map(field => `<label>${field}<input data-field="${field}" data-edge="${escapeAttribute(key)}" type="number" value="${edge[field]}"><input data-lock="${field}" data-edge="${escapeAttribute(key)}" type="checkbox" ${edge.lockedFields.includes(field) ? 'checked' : ''} title="锁定字段"></label>`).join('')}</div>`;
}

function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

function escapeAttribute(value) {
    return escapeHtml(value);
}

function statusText(state, edgeCount) {
    const base = `${Object.keys(state.graph.nodes).length} 个角色，${edgeCount} 条活跃关系`;
    return state.pendingRebuildFrom === null ? base : `${base}；第 ${state.pendingRebuildFrom} 层后待重建`;
}
