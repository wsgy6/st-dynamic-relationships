export function buildRelationshipPrompt(state, budget = 1400) {
    const lines = [
        '<dynamic_relationship_context>',
        '关系规则：所有角色（包括 {{user}}）均是平等节点；不存在玩家优先、隐藏魅力加成或保底配对。',
        '只让角色依据其亲历、目击或被告知的信息行动；传闻不是事实。不要在正文播报后台数值。',
        '关系变化应通过语言、选择、回避、主动接触和注意力表现；保持惯性，不可一轮跳变。',
    ];
    const edges = Object.values(state.graph.edges)
        .filter(isRelevant)
        .sort((left, right) => relevance(right) - relevance(left));
    for (const edge of edges) {
        const source = state.graph.nodes[edge.sourceId]?.displayName ?? edge.sourceId;
        const target = state.graph.nodes[edge.targetId]?.displayName ?? edge.targetId;
        const knowledge = edge.evidence.length ? '有事件依据' : '初始设定';
        const issues = edge.unresolved_issues.length ? `；未决：${edge.unresolved_issues.slice(0, 2).join('、')}` : '';
        lines.push(`${source} -> ${target}：${edge.private_feeling}/${edge.romantic_intent}，公开为 ${edge.public_status}，趋势 ${trend(edge.momentum)}，${knowledge}${issues}`);
        if (lines.join('\n').length >= budget) break;
    }
    lines.push('</dynamic_relationship_context>');
    return lines.join('\n').slice(0, budget);
}

function isRelevant(edge) {
    return edge.evidence.length || edge.public_status !== 'strangers' || edge.romantic_intent !== 'none' || Math.abs(edge.momentum) >= 5;
}

function relevance(edge) {
    return edge.evidence.length * 4 + Math.abs(edge.momentum) + edge.commitment + edge.jealousy + edge.resentment;
}

function trend(momentum) {
    if (momentum >= 8) return '升温';
    if (momentum <= -8) return '恶化';
    return '稳定';
}
