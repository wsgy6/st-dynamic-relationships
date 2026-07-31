import { relationshipEventBatchSchema, parseAndValidateEventBatch } from './schema.js';
import { ConnectionManagerRequestService } from '../../../shared.js';

export class EventExtractor {
    constructor(contextProvider, settingsProvider) {
        this.contextProvider = contextProvider;
        this.settingsProvider = settingsProvider;
        this.running = false;
    }

    async extract(messageIndex, graph) {
        if (this.running) return { valid: false, errors: ['已有事件抽取正在执行'], events: [] };
        const context = this.contextProvider();
        const message = context.chat[messageIndex];
        if (!message?.mes) return { valid: true, errors: [], events: [] };
        const knownNodes = Object.values(graph.nodes);
        if (knownNodes.length < 2) return { valid: true, errors: ['至少需要两个角色节点'], events: [] };
        this.running = true;
        try {
            const prompt = buildExtractionPrompt(context.chat, messageIndex, knownNodes);
            const raw = await this.generate(prompt);
            return parseAndValidateEventBatch(raw, knownNodes.map(node => node.id));
        } catch (error) {
            return { valid: false, errors: [`事件抽取失败: ${error.message}`], events: [] };
        } finally {
            this.running = false;
        }
    }

    async generate(prompt) {
        const settings = this.settingsProvider();
        const includePreset = !settings.isolateExtractionPreset;
        if (settings.extractionProvider !== 'profile') {
            return await this.contextProvider().generateRaw({
                prompt,
                systemPrompt: extractorSystemPrompt(),
                responseLength: settings.extractionResponseLength,
                jsonSchema: relationshipEventBatchSchema,
                includePreset,
                includeInstruct: includePreset,
            });
        }
        if (!settings.extractionProfileId) throw new Error('尚未选择事件抽取连接档案');
        const profile = ConnectionManagerRequestService.getProfile(settings.extractionProfileId);
        const messages = [
            { role: 'system', content: extractorSystemPrompt() },
            { role: 'user', content: prompt },
        ];
        const requestPrompt = ConnectionManagerRequestService.constructPrompt(messages, profile.id);
        const response = await ConnectionManagerRequestService.sendRequest(
            profile.id,
            requestPrompt,
            settings.extractionResponseLength,
            { stream: false, extractData: true, includePreset, includeInstruct: includePreset },
            { json_schema: relationshipEventBatchSchema, temperature: 0.1 },
        );
        if (!response || typeof response === 'function') throw new Error('独立连接未返回可解析文本');
        return response.content ?? '';
    }
}

function extractorSystemPrompt() {
    return '你是关系事件抽取器。只返回符合 JSON Schema 的事实事件，不推测未发生事件，不修改关系数值。';
}

function buildExtractionPrompt(chat, messageIndex, nodes) {
    const start = Math.max(0, messageIndex - 3);
    const transcript = chat.slice(start, messageIndex + 1).map((message, offset) => {
        const role = message.is_user ? '用户' : (message.name ?? '角色');
        return `[${start + offset}] ${role}: ${String(message.mes ?? '').slice(0, 4000)}`;
    }).join('\n');
    const roster = nodes.map(node => `- id=${node.id}; name=${node.displayName}; aliases=${node.aliases.join('/')}`).join('\n');
    return `从最新一回合抽取新发生且有明确文本证据的关系事件。最新一回合包括最后一条用户消息及其后的角色回复；更早消息仅供消歧，不得重复抽取。\n角色只能使用下列 id：\n${roster}\n\n规则：\n1. A 对 B 与 B 对 A 独立；不要输出数值变化。\n2. participants 是实际参与者；witnesses 只含亲眼目击者。\n3. 传闻使用 rumor，不能作为亲眼所见。\n4. 没有关系事件时返回 {"events":[]}。\n5. turn_index 固定为 ${messageIndex}。\n6. 用户必须使用 id={{user}}，没有任何优先权。\n\n聊天片段：\n${transcript}`;
}
