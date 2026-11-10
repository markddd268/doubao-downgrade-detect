// ==UserScript==
// @name         豆包降级检测
// @namespace    doubao-downgrade-detect
// @version      1.0.0
// @description  拦截 /im/conversation/batch_get 响应，检测当前对话 intention_agent_name 是否含 downgrade
// @match        https://www.doubao.com/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const API_PATH = '/im/conversation/batch_get';
  const COMPLETION_PATH = '/chat/completion';
  /** 回复结束后补发 batch_get 的延迟，给服务端落库留时间。 */
  const REFETCH_DELAYS_MS = [1500, 4000];
  const KEYWORD = 'downgrade';
  const LOG_PREFIX = '[豆包降级检测]';
  /** 问号悬停提示：intention_agent_name 取值含义（按字段字面意思推测，仅供参考）。 */
  const AGENT_HINT = [
    'intention_agent_name 取值含义（按字面意思推测，仅供参考）：',
    'pc_doubao_pro_agent：豆包 Pro 智能体',
    'pc_doubao_downgrade_agent：豆包降级智能体',
    'pc_general_nocot_agent：通用无思维链智能体',
    'pc_knowledge_search_nocot_agent：知识搜索无思维链智能体',
    'pc_knowledge_autosearch_nocot_agent：知识自动搜索无思维链智能体',
    'pc_rich_media_agent：富媒体智能体',
    'pc_rich_media_only_video_agent：仅视频富媒体智能体',
    '',
    '含 downgrade 即判定为降级。',
  ].join('\n');

  /** conversation_id -> {agent, index}，只保留该对话最新一条带 intention_agent_name 的消息。 */
  const convAgents = new Map();

  /** 从地址栏取当前 chat-id，例如 /chat/<chat-id>。 */
  function currentChatId() {
    const m = location.pathname.match(/\/chat\/(\d+)/);
    return m ? m[1] : null;
  }

  /** 解析 batch_get 响应，更新 convAgents。 */
  function handleBatchGet(data) {
    const list = data?.downlink_body?.batch_get_conv_info_downlink_body
        ?.conversation_info_list;
    if (!Array.isArray(list)) return;
    for (const conv of list) {
      for (const msg of conv.messages || []) {
        const agent = msg?.ext?.intention_agent_name;
        if (!agent) continue;
        const index = Number(msg.index_in_conv) || 0;
        const prev = convAgents.get(conv.conversation_id);
        if (!prev || index >= prev.index) {
          convAgents.set(conv.conversation_id, {agent, index});
        }
      }
    }
    render();
  }

  function tryParse(text) {
    try {
      handleBatchGet(JSON.parse(text));
    } catch (e) {
      console.warn(LOG_PREFIX, '解析 batch_get 响应失败', e);
    }
  }

  // 页面自己发过的 batch_get 地址（带 version_code 等参数），补发时复用
  let lastBatchGetUrl = null;

  /**
   * 对话进行中页面不会再请求 batch_get，流式回复里也没有 intention_agent_name，
   * 所以回复结束后主动为当前对话补发一次，响应由下面的 XHR 拦截统一处理。
   */
  function refetchCurrent() {
    const chatId = currentChatId();
    if (!chatId || !lastBatchGetUrl) return;
    const xhr = new XMLHttpRequest();
    xhr.open('POST', lastBatchGetUrl);
    xhr.withCredentials = true;
    xhr.setRequestHeader('content-type', 'application/json; encoding=utf-8');
    xhr.setRequestHeader('agw-js-conv', 'str');
    xhr.send(JSON.stringify({
      cmd: 1111,
      uplink_body: {
        batch_get_conv_info_uplink_body: {
          conversation_id: [chatId],
          option: {recent_message_count_per_conv: 1},
          ext: {},
        },
      },
      sequence_id: crypto.randomUUID(),
      channel: 2,
      version: '1',
    }));
  }

  function onCompletionEnd() {
    for (const delay of REFETCH_DELAYS_MS) setTimeout(refetchCurrent, delay);
  }

  // ---- 拦截 fetch ----
  const rawFetch = window.fetch;
  window.fetch = async function (...args) {
    const resp = await rawFetch.apply(this, args);
    try {
      const url = typeof args[0] === 'string' ? args[0] : args[0]?.url;
      if (url && url.includes(API_PATH)) {
        resp.clone().text().then(tryParse).catch(() => {});
      } else if (url && url.includes(COMPLETION_PATH)) {
        // 读完克隆的流即代表本轮回复结束
        resp.clone().text().then(onCompletionEnd).catch(() => {});
      }
    } catch (e) {
      // 拦截逻辑出错不影响页面
    }
    return resp;
  };

  // ---- 拦截 XHR ----
  const rawOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    if (String(url).includes(COMPLETION_PATH)) {
      this.addEventListener('loadend', onCompletionEnd);
    }
    if (String(url).includes(API_PATH)) {
      lastBatchGetUrl = String(url);
      this.addEventListener('load', () => {
        if (this.responseType === '' || this.responseType === 'text') {
          tryParse(this.responseText);
        } else if (this.responseType === 'json') {
          handleBatchGet(this.response);
        }
      });
    }
    return rawOpen.call(this, method, url, ...rest);
  };

  // ---- 右上角对话框 ----
  let panel = null;
  let lastLogged = '';

  /** 创建对话框：标题栏（可折叠）+ 内容区。 */
  function createPanel() {
    const box = document.createElement('div');
    box.style.cssText = [
      'position:fixed', 'top:64px', 'right:16px', 'z-index:2147483647',
      'width:280px', 'background:#fff', 'color:#1f2329',
      'border:1px solid #e5e6eb', 'border-radius:10px',
      'box-shadow:0 4px 16px rgba(0,0,0,.15)', 'font:13px/1.6 sans-serif',
      'overflow:hidden',
    ].join(';');

    const header = document.createElement('div');
    header.style.cssText = [
      'display:flex', 'justify-content:space-between', 'align-items:center',
      'padding:6px 12px', 'background:#f5f6f7', 'font-weight:600',
    ].join(';');
    const title = document.createElement('span');
    title.textContent = '豆包降级检测';
    const toggle = document.createElement('button');
    toggle.textContent = '－';
    toggle.title = '折叠/展开';
    toggle.style.cssText = 'border:none;background:none;cursor:pointer;'
        + 'font-size:14px;color:#646a73;padding:0 4px';
    header.append(title, toggle);

    const body = document.createElement('div');
    body.style.cssText = 'padding:8px 12px;word-break:break-all';
    toggle.addEventListener('click', () => {
      const hidden = body.style.display === 'none';
      body.style.display = hidden ? 'block' : 'none';
      toggle.textContent = hidden ? '－' : '＋';
    });

    box.append(header, body);
    document.body.appendChild(box);
    return {box, title, body};
  }

  let lastRowsKey = '';

  /** 渲染内容区的若干行 [标签, 值, 值颜色, 问号提示]，内容不变时不重建（避免悬停提示闪掉）。 */
  function setRows(rows) {
    const key = JSON.stringify(rows);
    if (key === lastRowsKey) return;
    lastRowsKey = key;
    panel.body.replaceChildren(...rows.map(([label, value, color, hint]) => {
      const row = document.createElement('div');
      const k = document.createElement('span');
      k.textContent = label;
      k.style.color = '#8f959e';
      if (hint) {
        const q = document.createElement('span');
        q.textContent = '?';
        q.title = hint;
        q.style.cssText = [
          'display:inline-block', 'width:14px', 'height:14px',
          'margin-left:3px', 'border-radius:50%', 'background:#c9cdd4',
          'color:#fff', 'font-size:11px', 'line-height:14px',
          'text-align:center', 'cursor:help', 'vertical-align:1px',
        ].join(';');
        k.append(q);
      }
      k.append('：');
      const v = document.createElement('span');
      v.textContent = value;
      if (color) v.style.cssText = `color:${color};font-weight:600`;
      row.append(k, v);
      return row;
    }));
  }

  function render() {
    if (!document.body) return;
    if (!panel) panel = createPanel();
    const chatId = currentChatId();
    const info = chatId ? convAgents.get(chatId) : null;
    if (!chatId) {
      panel.title.style.color = '';
      setRows([['状态', '未进入对话']]);
      return;
    }
    if (!info) {
      panel.title.style.color = '';
      setRows([['对话 ID', chatId], ['状态', '等待数据…', '#8f959e']]);
      return;
    }
    const downgraded = info.agent.toLowerCase().includes(KEYWORD);
    const color = downgraded ? '#e53935' : '#43a047';
    panel.title.style.color = color;
    setRows([
      ['对话 ID', chatId],
      ['状态', downgraded ? '已降级' : '未降级', color],
      ['intention_agent_name', info.agent, '', AGENT_HINT],
    ]);

    const logKey = `${chatId}|${info.index}|${info.agent}`;
    if (logKey !== lastLogged) {
      lastLogged = logKey;
      console.log(LOG_PREFIX, {chatId, downgraded, ...info});
    }
  }

  // SPA 切换对话时地址变化，定时刷新显示
  setInterval(render, 1000);
})();
