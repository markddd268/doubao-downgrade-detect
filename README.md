# 豆包降级检测

一个油猴（Tampermonkey）脚本。在豆包网页版（`https://www.doubao.com/chat/<chat-id>`）对话时，在页面右上角显示当前对话是否被「降级」。

## 安装

1. 浏览器安装 [Tampermonkey](https://www.tampermonkey.net/) 扩展。
2. 打开下面的链接，Tampermonkey 会弹出安装页，点「安装」：

   <https://raw.githubusercontent.com/markddd268/doubao-downgrade-detect/main/doubao-downgrade-detect.user.js>

   也可以在 Tampermonkey 里新建脚本，把 `doubao-downgrade-detect.user.js` 的内容整段粘贴进去保存。
3. 刷新豆包页面即可生效。

## 使用

进入豆包网页版后，右上角会出现一个「豆包降级检测」小对话框（标题栏右侧「－／＋」可折叠）：

| 场景 | 显示内容 |
| --- | --- |
| 不在对话页（如首页） | 状态：未进入对话 |
| 在对话页，数据未返回 | 对话 ID、状态：等待数据… |
| 已拿到数据 | 对话 ID、状态（**未降级** 绿色 / **已降级** 红色）、`intention_agent_name` |

`intention_agent_name` 旁的「?」悬停可查看各取值的含义。

每轮回复结束后会自动刷新结果，无需手动刷新页面。浏览器控制台中也会输出 `[豆包降级检测]` 开头的日志。

## 判断逻辑

- 豆包页面加载或切换对话时，会请求 `/im/conversation/batch_get`，响应里的 `conversation_info_list` 按 `conversation_id` 分组，包含历史对话和当前对话最近一条消息的信息。
- 脚本拦截该响应，取当前对话（地址栏中的 chat-id）最新一条消息的 `ext.intention_agent_name`。
- 该值包含关键词 `downgrade`（不区分大小写）即判定为**已降级**。
- 对话进行中页面不会再请求 `batch_get`，流式回复接口 `/chat/completion` 里也没有该字段。因此脚本在每轮回复结束后，复用页面的请求参数，只针对当前对话补发一次 `batch_get`（延迟约 1.5 秒与 4 秒各一次），以拿到本轮的结果。

## intention_agent_name 取值含义

> 以下基于字段字面意思推测，仅供参考。

| 取值 | 含义 |
| --- | --- |
| `pc_doubao_pro_agent` | 豆包 Pro 智能体 |
| `pc_doubao_downgrade_agent` | 豆包降级智能体 |
| `pc_general_nocot_agent` | 通用无思维链智能体 |
| `pc_knowledge_search_nocot_agent` | 知识搜索无思维链智能体 |
| `pc_knowledge_autosearch_nocot_agent` | 知识自动搜索无思维链智能体 |
| `pc_rich_media_agent` | 富媒体智能体 |
| `pc_rich_media_only_video_agent` | 仅视频富媒体智能体 |

## 注意事项

- 部分较早的对话消息中没有 `intention_agent_name` 字段，此时会一直显示「等待数据…」。
- 脚本依赖豆包网页版当前的接口结构，接口变化后可能失效。
- 脚本只读取接口响应，补发的 `batch_get` 也只是查询，不会修改任何对话内容。

## 许可

[Apache License 2.0](LICENSE)
