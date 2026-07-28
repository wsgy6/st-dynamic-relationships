# 动态关系网络

SillyTavern 第三方扩展。它以聊天为边界维护多角色、有向、可追溯的情感关系图；`{{user}}` 只是普通节点，不存在主角优先或保底配对。

## 安装

1. 将本目录发布为独立 GitHub 仓库 `https://github.com/wsgy6/st-dynamic-relationships`；若使用其他地址，请同步修改 `manifest.json` 的 `homePage`。
2. 在 SillyTavern 的“扩展”面板选择“从 URL 安装扩展”，粘贴该 GitHub 仓库 URL。
3. 启用“动态关系网络”，切换或新建聊天后点击右下角“关系”。

要求：SillyTavern `1.18.0` 或更高版本，且已配置可生成文本的 API。扩展不需要 Tavern Helper、STScript 或远程脚本。

## 工作方式

- 初始化会读取当前角色卡和 Character Book 中具备 `name/名称` 与 Profile/性格字段的条目，创建独立角色节点。当前提供的“辣妈庄园第一季”卡会识别傅雪、顾星野、陆司宴、霍宇昂、齐慕白、林知秋、唐诗韵、沈曼辞、虞归晚、许知研等 SFW Profile 条目。
- 生成前注入精简关系上下文，不公开隐藏数值，也不把未目击信息告诉角色。
- 新消息生成后使用独立结构化调用抽取 `RelationshipEvent[]`，先做本地严格 Schema 校验，再由确定性引擎更新关系。
- 状态存于 `chat_metadata.st_dynamic_relationships_state`，事件副本同时附于产生该事件的消息；编辑、删除和 swipe 后会从有效消息记录重建。
- 解析失败、未知角色、未知字段或非法 JSON 时，旧状态不变。

## 数据格式

关系边为 `A -> B`，与 `B -> A` 独立。完整边包含：

`familiarity`、`affinity`、`attraction`、`trust`、`respect`、`intimacy`、`commitment`、`dependency`、`jealousy`、`resentment`、`fear`、`compatibility`、`perceived_interest`、`romantic_intent`、`public_status`、`private_feeling`、`exclusivity_expectation`、`secrecy`、`momentum`、`last_meaningful_event`、`unresolved_issues`、`evidence`。

节点包含稳定特质、择偶偏好、取向约束、底线、情感需要、依恋与忠诚模型、主动性、风险偏好、当前心仪对象和来源信息。性别不进入算法；取向仅作为角色定义约束。

每轮更新包含：`previous_snapshot_id`、`source_message_id`、`extracted_events`、`deterministic_changes`、`rejected_changes`、`validation_warnings`、`resulting_snapshot_id`。

## 操作与调试

- 默认面板只显示关系方向、私下感受、意图、公开状态与关键事件。
- 打开“调试”后可查看全部数值，直接校正数值会自动锁定该字段，避免后续事件覆盖人工决定。
- 面板支持重新读取角色定义、从聊天重建、回滚最近一轮、JSON 导出和导入。
- “自动抽取”可以关闭，关闭后仅保留已有状态，便于手动调试。

## 限制

- 角色卡只提供初始定义。复杂角色偏好建议在 Character Book Profile 中明确写出 `romantic_preferences`、`dealbreakers`、`loyalty_model`、`attachment_style` 等字段。
- 所有模型端点对 JSON Schema 的遵循程度不同；本地验证会防止坏结果损坏状态，但不能把不支持结构化输出的模型变成可靠抽取器。
- 编辑历史消息后，扩展会重放仍带有效事件副本的消息。被编辑的旧消息需要在下一次生成后重新抽取事件。

## 开发验证

```powershell
npm test
Get-ChildItem src -Filter *.js | ForEach-Object { node --check $_.FullName }
node --check index.js
```

测试覆盖关系非对称、NPC 成功配对、竞争者胜过 `{{user}}`、多重情感、非瞬时移情、忠诚/秘密追求、传闻信息边界、删除重建与解析失败保护。
