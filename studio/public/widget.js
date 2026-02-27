// Mizan Agent Chat Widget v1.0
// Usage: <script src="/widget.js" data-agent="AGENT_ID" data-key="API_KEY" data-theme="navy"></script>

(function() {
  const script = document.currentScript;
  const agentId = script && script.getAttribute('data-agent') || '';
  const apiKey = script && script.getAttribute('data-key') || '';
  const theme = script && script.getAttribute('data-theme') || 'navy';
  const lang = script && script.getAttribute('data-lang') || 'en';
  const baseUrl = script && script.src ? script.src.replace('/widget.js', '') : '';

  const isAr = lang === 'ar';
  const dir = isAr ? 'rtl' : 'ltr';

  const colors = {
    navy: { bg: '#0B1F3A', gold: '#D4AF37', dark: '#060C18' },
    light: { bg: '#f8f9fa', gold: '#D4AF37', dark: '#1a1a2e' }
  };
  const c = colors[theme] || colors.navy;

  const style = document.createElement('style');
  style.textContent = [
    '#mzn-widget-btn{position:fixed;bottom:24px;right:24px;width:56px;height:56px;border-radius:50%;background:' + c.gold + ';color:' + c.dark + ';font-size:24px;border:none;cursor:pointer;box-shadow:0 4px 20px rgba(0,0,0,.3);z-index:99999;display:flex;align-items:center;justify-content:center;transition:transform .2s;}',
    '#mzn-widget-btn:hover{transform:scale(1.1);}',
    '#mzn-widget-box{position:fixed;bottom:90px;right:24px;width:360px;height:520px;background:' + c.dark + ';border:1px solid ' + c.gold + '33;border-radius:16px;box-shadow:0 8px 40px rgba(0,0,0,.4);z-index:99998;display:none;flex-direction:column;overflow:hidden;font-family:\'Segoe UI\',sans-serif;}',
    '#mzn-widget-box.open{display:flex;}',
    '#mzn-widget-header{background:' + c.bg + ';padding:16px;display:flex;align-items:center;gap:10px;border-bottom:1px solid ' + c.gold + '22;}',
    '#mzn-widget-header .avatar{width:36px;height:36px;border-radius:50%;background:' + c.gold + ';display:flex;align-items:center;justify-content:center;font-size:18px;}',
    '#mzn-widget-header .title{font-weight:700;color:#fff;font-size:14px;}',
    '#mzn-widget-header .subtitle{font-size:11px;color:#6b82a8;margin-top:2px;}',
    '#mzn-widget-header .close-btn{margin-left:auto;background:none;border:none;color:#6b82a8;cursor:pointer;font-size:18px;}',
    '#mzn-messages{flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:12px;}',
    '.mzn-msg{max-width:85%;padding:10px 14px;border-radius:12px;font-size:13px;line-height:1.5;word-wrap:break-word;}',
    '.mzn-msg.user{background:' + c.gold + ';color:' + c.dark + ';align-self:flex-end;font-weight:600;border-radius:12px 12px 4px 12px;}',
    '.mzn-msg.bot{background:' + c.bg + ';color:#e2e8f0;align-self:flex-start;border-radius:12px 12px 12px 4px;border:1px solid ' + c.gold + '22;}',
    '.mzn-msg.bot .sources{margin-top:8px;padding-top:8px;border-top:1px solid ' + c.gold + '22;font-size:11px;color:#6b82a8;}',
    '.mzn-msg.bot .compliance{margin-top:6px;font-size:11px;color:#34d399;}',
    '.mzn-typing{align-self:flex-start;background:' + c.bg + ';border-radius:12px;padding:10px 16px;color:#6b82a8;font-size:13px;border:1px solid ' + c.gold + '22;}',
    '#mzn-input-area{padding:12px;border-top:1px solid ' + c.gold + '22;display:flex;gap:8px;}',
    '#mzn-input{flex:1;background:' + c.bg + ';border:1px solid ' + c.gold + '33;border-radius:8px;padding:10px 12px;color:#fff;font-size:13px;outline:none;resize:none;font-family:inherit;}',
    '#mzn-input::placeholder{color:#4a5568;}',
    '#mzn-send{background:' + c.gold + ';color:' + c.dark + ';border:none;border-radius:8px;padding:10px 16px;font-weight:700;cursor:pointer;font-size:13px;}',
    '#mzn-send:disabled{opacity:.5;cursor:not-allowed;}',
    '#mzn-powered{text-align:center;font-size:10px;color:#2d3748;padding:4px 0 8px;}',
    '#mzn-powered a{color:' + c.gold + '33;text-decoration:none;}',
    '@media (max-width:480px){#mzn-widget-box{right:8px;left:8px;width:auto;height:65vh;bottom:78px;}#mzn-widget-btn{right:12px;bottom:12px;}}'
  ].join('');
  document.head.appendChild(style);

  const box = document.createElement('div');
  box.id = 'mzn-widget-box';
  box.innerHTML = '' +
    '<div id="mzn-widget-header">' +
    '  <div class="avatar">⚖️</div>' +
    '  <div>' +
    '    <div class="title">Mizan Agent</div>' +
    '    <div class="subtitle" id="mzn-agent-name">Loading...</div>' +
    '  </div>' +
    '  <button class="close-btn" id="mzn-close">✕</button>' +
    '</div>' +
    '<div id="mzn-messages">' +
    '  <div class="mzn-msg bot" dir="' + dir + '">' + (isAr ? 'مرحباً! كيف يمكنني مساعدتك؟' : 'Hello! How can I help you today?') + '</div>' +
    '</div>' +
    '<div id="mzn-input-area">' +
    '  <textarea id="mzn-input" rows="1" placeholder="' + (isAr ? 'اكتب رسالتك...' : 'Type your message...') + '" dir="' + dir + '"></textarea>' +
    '  <button id="mzn-send">' + (isAr ? '←' : '→') + '</button>' +
    '</div>' +
    '<div id="mzn-powered">Powered by <a href="https://github.com/mizanuae10x/mizan-sdk">⚖️ Mizan SDK</a></div>';
  document.body.appendChild(box);

  const btn = document.createElement('button');
  btn.id = 'mzn-widget-btn';
  btn.innerHTML = '⚖️';
  document.body.appendChild(btn);

  fetch(baseUrl + '/api/agents')
    .then(function(r) { return r.json(); })
    .then(function(agents) {
      const agent = agents.find(function(a) { return a.id === agentId; });
      if (agent) {
        const nameEl = document.getElementById('mzn-agent-name');
        if (nameEl) nameEl.textContent = agent.name;
      }
    })
    .catch(function() {});

  btn.addEventListener('click', function() { box.classList.toggle('open'); });
  document.getElementById('mzn-close').addEventListener('click', function() { box.classList.remove('open'); });

  async function send() {
    const input = document.getElementById('mzn-input');
    const msg = input.value.trim();
    if (!msg) return;
    input.value = '';

    const msgs = document.getElementById('mzn-messages');
    const sendBtn = document.getElementById('mzn-send');

    const userBubble = document.createElement('div');
    userBubble.className = 'mzn-msg user';
    userBubble.dir = dir;
    userBubble.textContent = msg;
    msgs.appendChild(userBubble);

    const typing = document.createElement('div');
    typing.className = 'mzn-typing';
    typing.textContent = isAr ? '...يكتب' : 'Thinking...';
    msgs.appendChild(typing);
    msgs.scrollTop = msgs.scrollHeight;
    sendBtn.disabled = true;

    try {
      const endpoint = apiKey
        ? baseUrl + '/api/agents/' + agentId + '/chat'
        : baseUrl + '/api/agents/' + agentId + '/chat/public';

      const resp = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey ? { Authorization: 'Bearer ' + apiKey } : {})
        },
        body: JSON.stringify({ message: msg, session_id: 'widget-' + Date.now() })
      });
      const data = await resp.json();

      typing.remove();
      const botBubble = document.createElement('div');
      botBubble.className = 'mzn-msg bot';
      botBubble.dir = dir;

      let html = '<div>' + (data.answer || data.error || 'Error') + '</div>';
      if (data.sources && data.sources.length) {
        html += '<div class="sources">📎 ' + data.sources.map(function(s, i) {
          return '[' + (i + 1) + '] ' + s.doc + ' (' + Math.round(s.score * 100) + '%)';
        }).join(' · ') + '</div>';
      }
      if (data.compliance) {
        const statusEmoji = data.compliance.status === 'COMPLIANT' ? '✅' : data.compliance.status === 'REVIEW_REQUIRED' ? '⚠️' : '❌';
        html += '<div class="compliance">' + statusEmoji + ' Compliance: ' + data.compliance.score + '/100</div>';
      }
      botBubble.innerHTML = html;
      msgs.appendChild(botBubble);
    } catch (e) {
      typing.remove();
      const errBubble = document.createElement('div');
      errBubble.className = 'mzn-msg bot';
      errBubble.textContent = 'Connection error. Please try again.';
      msgs.appendChild(errBubble);
    }

    msgs.scrollTop = msgs.scrollHeight;
    sendBtn.disabled = false;
    input.focus();
  }

  document.getElementById('mzn-send').addEventListener('click', send);
  document.getElementById('mzn-input').addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  });
})();
