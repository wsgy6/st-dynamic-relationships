import { extension_settings } from '../../../extensions.js';
import { eventSource, event_types } from '../../../../script.js';
import { DEFAULT_SETTINGS, EXTENSION_ID } from './src/constants.js';
import { RelationshipLifecycle } from './src/lifecycle.js';
import { StateStore } from './src/state-store.js';
import { RelationshipPanel } from './src/ui-panel.js';

const contextProvider = () => globalThis.SillyTavern.getContext();
extension_settings[EXTENSION_ID] = { ...DEFAULT_SETTINGS, ...(extension_settings[EXTENSION_ID] ?? {}) };
const settings = () => extension_settings[EXTENSION_ID];

let lifecycle;

async function init() {
    const panel = new RelationshipPanel(contextProvider, settings, () => lifecycle);
    const store = new StateStore(contextProvider, settings);
    lifecycle = new RelationshipLifecycle(contextProvider, store, settings, panel);
    await lifecycle.initialize();
    eventSource.on(event_types.GENERATION_AFTER_COMMANDS, () => lifecycle.refreshInjection());
}

globalThis.dynamicRelationshipsGenerateInterceptor = async () => {
    if (lifecycle) lifecycle.refreshInjection();
};

globalThis.stDynamicRelationships = {
    get state() { return lifecycle?.store.state; },
    async rebuild() { await lifecycle?.store.rebuildFromMessages(); lifecycle?.refreshInjection(); lifecycle?.panel.render(lifecycle.store.state); },
};

void init();
