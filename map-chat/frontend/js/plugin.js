(function () {
  'use strict';
  const STORE = 'map-chat-v1';
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
  class MapChat {
    deliveryLabel(message) { return message.delivery_status === 'failed' && (message.delivery_error === 'MAX_RETRANSMIT' || message.delivery_error === 5) ? 'No acknowledgement' : null; }
    onEnable(api) {
      this.api = api; this.messages = {}; this.names = {}; this.tracker = null; this.active = 'ch:0'; this.online = false; this.pending = false; this.dead = false; this.deliveryUpdates = {};
      try { this.saved = JSON.parse(localStorage.getItem(STORE)) || {}; } catch (_) { this.saved = {}; }
      this.saved.pins ||= []; this.saved.unread ||= {}; this.saved.drafts ||= {};
      if (typeof this.saved.active === 'string' && /^(ch:\d+|dm:![0-9a-f]{8})$/i.test(this.saved.active)) this.active = this.saved.active;
      this.panel = el('section', 'map-chat'); this.panel.dataset.panelTitle = '💬 Map Chat';
      this.body = el('div', 'mc-body'); this.panel.append(this.body);
      this.toolbar = el('div', 'mc-toolbar'); this.bell = el('button', 'mc-bell', '🔔 0'); this.bell.type = 'button'; this.bell.title = 'Unread messages'; this.status = el('span', 'mc-status', 'Connecting…');
      this.toolbar.append(this.bell, this.status); this.body.append(this.toolbar);
      this.layout = el('div', 'mc-layout'); this.sidebar = el('div', 'mc-sidebar'); this.list = el('div', 'mc-list');
      this.search = el('input', 'mc-search'); this.search.placeholder = 'Find a node'; this.search.setAttribute('aria-label', 'Find a node for a private chat');
      this.results = el('div', 'mc-results'); this.sidebar.append(this.search, this.results, this.list);
      this.main = el('div', 'mc-main'); this.header = el('div', 'mc-header'); this.back = el('button', 'mc-back', '← Chats'); this.back.type = 'button'; this.back.setAttribute('aria-label', 'Back to conversations'); this.back.addEventListener('click', () => { this.panel.classList.remove('mc-chat-open'); this.toggleEmojiPicker(false); }); this.heading = el('div', 'mc-heading'); this.header.append(this.back, this.heading); this.feed = el('div', 'mc-feed'); this.feed.setAttribute('aria-live', 'polite');
      this.form = el('form', 'mc-form'); this.input = el('textarea', 'mc-input'); this.input.rows = 2; this.input.placeholder = 'Write a message…'; this.input.setAttribute('aria-label', 'Message');
      this.input.value = this.saved.drafts[this.active] || '';
      this.emojiWrap = el('div', 'mc-emoji-wrap'); this.emojiButton = el('button', 'mc-emoji-button', '😊'); this.emojiButton.type = 'button'; this.emojiButton.title = 'Insert emoji'; this.emojiButton.setAttribute('aria-label', 'Insert emoji'); this.emojiButton.setAttribute('aria-expanded', 'false');
      this.emojiPicker = el('div', 'mc-emoji-picker'); this.emojiPicker.hidden = true; this.emojiPicker.setAttribute('aria-label', 'Choose an emoji');
      [['😀','grinning face'],['😊','smiling face'],['😂','laughing'],['👍','thumbs up'],['👋','wave'],['❤️','heart'],['🎉','celebration'],['🙏','thanks'],['✅','check mark'],['☀️','sun']].forEach(([emoji, name]) => { const button = el('button', 'mc-emoji-choice', emoji); button.type = 'button'; button.title = name; button.setAttribute('aria-label', name); button.addEventListener('click', () => this.insertEmoji(emoji)); this.emojiPicker.append(button); });
      this.emojiButton.addEventListener('click', () => this.toggleEmojiPicker()); this.emojiPicker.addEventListener('keydown', e => { if (e.key === 'Escape') { this.toggleEmojiPicker(false); this.emojiButton.focus(); } }); this.emojiWrap.append(this.emojiButton, this.emojiPicker);
      this.send = el('button', 'mc-send', 'Send'); this.send.type = 'submit'; this.form.append(this.emojiWrap, this.input, this.send); this.main.append(this.header, this.feed, this.form);
      this.layout.append(this.sidebar, this.main); this.body.append(this.layout);
      this.nodeDetails = el('section', 'mc-node-details'); this.nodeDetails.hidden = true; this.nodeDetails.setAttribute('role', 'dialog'); this.nodeDetails.setAttribute('aria-label', 'Node details'); this.nodeDetails.addEventListener('keydown', e => { if (e.key === 'Escape') this.closeNodeDetails(); }); this.body.append(this.nodeDetails); api.panels.register(this.panel);
      this.restorePanelSize();
      this.search.addEventListener('input', () => this.renderSearch()); this.input.addEventListener('input', () => { this.saved.drafts[this.active] = this.input.value; this.save(); });
      this.input.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); this.form.requestSubmit(); } });
      this.form.addEventListener('submit', e => { e.preventDefault(); this.sendMessage(); });
      this.bell.addEventListener('click', () => { const first = this.keys().find(k => this.saved.unread[k]); if (first) this.select(first); });
      api.nodes.onUpdate(node => {
        if (this.dead || !node || !node.id) return;
        if (this.search.value.trim()) this.renderSearch();
        if (this.detailsNodeId === node.id) this.renderNodeDetails();
        if (Object.values(this.messages).some(items => items.some(m => m.from_id === node.id)) || this.active === `dm:${node.id}`) this.render();
      });
      this.connect(); this.render();
    }
    restorePanelSize() {
      const size = this.saved.panelSize;
      if (size && Number.isFinite(size.width) && Number.isFinite(size.height) && size.width >= 320 && size.height >= 265 && size.width <= 10000 && size.height <= 10000) {
        this.panel.style.width = `${size.width}px`; this.panel.style.height = `${size.height}px`;
      }
      if (typeof ResizeObserver === 'undefined') return;
      this.sizeObserver = new ResizeObserver(() => {
        if (this.dead || window.matchMedia('(max-width: 768px)').matches || this.panel.classList.contains('panel-collapsed')) return;
        // The browser's native resize handle writes pixel sizes to inline styles.
        // Use those requested sizes rather than viewport-clamped measurements.
        const width = Number.parseFloat(this.panel.style.width), height = Number.parseFloat(this.panel.style.height);
        if (!Number.isFinite(width) || !Number.isFinite(height) || width < 320 || height < 265 || width > 10000 || height > 10000) return;
        if (this.saved.panelSize && this.saved.panelSize.width === width && this.saved.panelSize.height === height) return;
        this.saved.panelSize = {width, height}; this.save();
      });
      this.sizeObserver.observe(this.panel);
    }
    toggleEmojiPicker(open = this.emojiPicker.hidden) { this.emojiPicker.hidden = !open; this.emojiButton.setAttribute('aria-expanded', String(open)); }
    insertEmoji(emoji) { const input = this.input; const start = input.selectionStart, end = input.selectionEnd; input.setRangeText(emoji, start, end, 'end'); this.saved.drafts[this.active] = input.value; this.save(); this.toggleEmojiPicker(false); input.focus(); }
    save() { try { localStorage.setItem(STORE, JSON.stringify(this.saved)); } catch (_) {} }
    connect() {
      if (this.dead) return;
      this.online = this.api.messages.connected();
      this.unsubscribe = this.api.messages.subscribe(event => {
        if (this.dead) return;
        if (event.type === 'connected') { this.online = true; this.status.textContent = 'Connected'; }
        if (event.type === 'disconnected') { this.online = false; if (this.pending) { this.pending = false; this.updateDelivery(this.sentId, 'unknown', 1); this.status.textContent = 'Disconnected; send outcome unknown'; } else this.status.textContent = 'Disconnected'; }
        if (event.type === 'history') this.loadHistory(event.messages, event.channelNames);
        if (event.type === 'tracker' && event.tracker) this.tracker = event.tracker.node_id || this.tracker;
        if (event.type === 'message' && event.message) this.add(event.message, true);
        if (event.type === 'delivery') { const d = event.update; this.updateDelivery(d.message_id, d.status, d.revision, d.error); }
        if (this.detailsNodeId && (event.type === 'connected' || event.type === 'disconnected')) this.renderNodeDetails();
        this.render();
      });
      const history = this.api.messages.history(); if (history.tracker) this.tracker = history.tracker.node_id || this.tracker; this.loadHistory(history.messages, history.channelNames);
      this.status.textContent = this.online ? 'Connected' : 'Disconnected';
    }
    loadHistory(messages, names) {
      const local = Object.values(this.messages).flat().filter(m => m.message_id && ['sending', 'unknown', 'failed'].includes(m.delivery_status));
      this.names = Object.assign({}, this.names, names || {}); this.messages = {};
      const groups = Array.isArray(messages) ? {0:messages} : (messages || {});
      const stored = Object.values(groups).flat(); stored.forEach(m => this.add(m, false));
      const ids = new Set(stored.map(m => m.message_id).filter(Boolean));
      local.filter(m => !ids.has(m.message_id)).forEach(m => this.add(m, false));
    }
    sendResult(d) {
      if (this.dead) return;
      this.pending = false;
      if (d.success) { this.status.textContent = 'Send submitted'; if (this.saved.drafts[this.sentKey] === this.sentText) { this.saved.drafts[this.sentKey] = ''; if (this.active === this.sentKey) this.input.value = ''; this.save(); } }
      else { this.updateDelivery(this.sentId, /outcome (is )?unknown/i.test(d.message || '') ? 'unknown' : 'failed', 1, d.message); this.status.textContent = 'Send failed' + (d.message ? ': ' + d.message : ''); }
      this.render();
    }

    key(m) { if (!m.is_dm) return `ch:${Number(m.channel_index) || 0}`; const peer = m.from_id === this.tracker ? m.to_id : m.from_id; return peer && peer !== '^all' ? `dm:${peer}` : null; }
    add(m, live) { const k = this.key(m); if (!k) return; const a = this.messages[k] ||= [];
      const existing = m.message_id && a.findIndex(x => x.message_id === m.message_id);
      if (existing !== false && existing !== null && existing !== undefined && existing >= 0) a.splice(existing, 1);
      const update = m.message_id && this.deliveryUpdates[m.message_id];
      if (update && update.revision > (m.delivery_revision || 0)) Object.assign(m, {delivery_status:update.status, delivery_revision:update.revision, delivery_error:update.error});
      a.push(m); a.sort((x,y) => (x.timestamp || 0) - (y.timestamp || 0));
      if (live && m.from_id !== this.tracker && (k !== this.active || document.hidden || this.panel.classList.contains('panel-collapsed'))) { this.saved.unread[k] = (this.saved.unread[k] || 0) + 1; this.save(); }
    }
    updateDelivery(id, status, revision, error) {
      if (!id) return;
      const old = this.deliveryUpdates[id];
      if (old && old.revision >= revision) return;
      this.deliveryUpdates[id] = {status, revision, error};
      Object.values(this.messages).flat().filter(m => m.message_id === id && (m.delivery_revision || 0) < revision)
        .forEach(m => Object.assign(m, {delivery_status:status, delivery_revision:revision, delivery_error:error}));
    }
    keys() { const keys = new Set([...Object.keys(this.messages), ...Object.keys(this.names).map(i => `ch:${i}`), ...this.saved.pins, this.active]); return [...keys].sort((a,b) => { const p = Number(this.saved.pins.includes(b)) - Number(this.saved.pins.includes(a)); if (p) return p; if (this.saved.pins.includes(a) && this.saved.pins.includes(b)) return this.saved.pins.indexOf(a) - this.saved.pins.indexOf(b); const u = Number(!!this.saved.unread[b]) - Number(!!this.saved.unread[a]); if (u) return u; return this.last(b) - this.last(a) || a.localeCompare(b); }); }
    last(k) { const a = this.messages[k] || []; return a.length ? a[a.length-1].timestamp || 0 : 0; }
    openNodeDetails(id, trigger) { if (!id || id === '^all') return; this.detailsNodeId = id; this.detailsTrigger = trigger; this.renderNodeDetails(); this.nodeDetails.hidden = false; this.nodeDetails.querySelector('.mc-node-close').focus(); }
    closeNodeDetails() { this.nodeDetails.hidden = true; this.detailsNodeId = null; if (this.detailsTrigger && this.detailsTrigger.isConnected) this.detailsTrigger.focus(); this.detailsTrigger = null; }
    renderNodeDetails() {
      const id = this.detailsNodeId; if (!id) return;
      const node = [...this.api.nodes.getAll(), ...this.api.nodes.getNoPosition()].find(n => n.id === id);
      this.nodeDetails.replaceChildren(); const top = el('div', 'mc-node-top'); const title = el('strong', 'mc-node-title', node && node.name || id); const close = el('button', 'mc-node-close', '✕'); close.type = 'button'; close.setAttribute('aria-label', 'Close node details'); close.onclick = () => this.closeNodeDetails(); top.append(title, close); this.nodeDetails.append(top);
      const list = el('dl', 'mc-node-list'); const row = (label, value) => { if (value === null || value === undefined || value === '') return; list.append(el('dt', '', label), el('dd', '', String(value))); };
      row('Node ID', id);
      if (node) {
        row('Short name', node.short_name); row('Role', node.role); row('Hardware', node.hw_model);
        if (node.ts && Number.isFinite(Number(node.ts))) row(node.source === 'nodedb' ? 'Imported (age may be inaccurate)' : 'Last update', new Date(Number(node.ts) * 1000).toLocaleString());
        if (node.hops != null) row('Hops (node)', node.hops); if (node.snr != null && node.snr !== 0) row('SNR (node)', `${node.snr} dB`); if (node.rssi != null) row('RSSI (node)', `${node.rssi} dBm`);
        if (node.battery_level != null) row('Battery', node.battery_level === 101 ? 'External power' : `${node.battery_level}%`); if (node.voltage != null) row('Voltage', `${node.voltage} V`);
        if (node.uptime_seconds != null) row('Uptime', `${Math.floor(node.uptime_seconds / 3600)} h ${Math.floor(node.uptime_seconds % 3600 / 60)} min`);
        if (Number.isFinite(node.lat) && Number.isFinite(node.lon)) row('Position', `${node.lat}, ${node.lon}`);
        if (node.via_mqtt) row('Connection', 'MQTT');
      } else this.nodeDetails.append(el('p', 'mc-node-empty', 'No current node details are available.'));
      this.nodeDetails.append(list); const note = el('p', 'mc-node-note', 'Radio details describe the latest node record, not this message.'); this.nodeDetails.append(note);
      const actions = el('div', 'mc-node-actions');
      if (id !== this.tracker && /^![0-9a-f]{8}$/i.test(id)) {
        const message = el('button', 'mc-node-action', 'Message privately'); message.type = 'button'; message.onclick = () => { this.closeNodeDetails(); this.select(`dm:${id}`); }; actions.append(message);
        const trace = el('button', 'mc-node-action', 'Traceroute'); trace.type = 'button'; trace.disabled = !this.online || typeof window.startTraceroute !== 'function' || !!(node && (node.via_mqtt || (node.net && node.net !== 'MT'))); trace.title = trace.disabled ? 'Traceroute is unavailable for this node or connection' : 'Open the map traceroute'; trace.onclick = () => { if (trace.disabled) return; this.closeNodeDetails(); if (window.matchMedia('(max-width: 768px)').matches && typeof window.closeLayersDrawer === 'function') window.closeLayersDrawer(); window.startTraceroute(id); }; actions.append(trace);
      }
      this.nodeDetails.append(actions);
    }
    senderName(m, nodes) { const id = m.from_id; const node = nodes.find(n => n.id === id); return (node && [node.name, node.short_name].find(name => name && name !== id)) || m.from_name || id || 'Unknown'; }
    label(k) { if (k.startsWith('ch:')) { const n = k.slice(3); return this.names[n] || (n === '0' ? 'Primary' : `Channel ${n}`); } const id = k.slice(3); const node = [...this.api.nodes.getAll(), ...this.api.nodes.getNoPosition()].find(n => n.id === id); const m = (this.messages[k] || []).find(x => x.from_id === id); return (node && (node.name || node.id)) || (m && m.from_name) || id; }
    select(k) { if (this.emojiPicker) this.toggleEmojiPicker(false); const wasOpen = this.panel && this.panel.classList.contains('mc-chat-open'); if (this.panel) this.panel.classList.add('mc-chat-open'); const changed = this.active !== k; this.active = k; this.saved.active = k; this.saved.unread[k] = 0; this.input.value = this.saved.drafts[k] || ''; this.save(); this.render(); if ((changed || !wasOpen) && this.feed) this.feed.scrollTop = this.feed.scrollHeight; }
    renderSearch() { this.results.replaceChildren(); const q = this.search.value.trim().toLowerCase(); if (!q) return; const nodes = [...this.api.nodes.getAll(), ...this.api.nodes.getNoPosition()].filter(n => n.id && n.id !== this.tracker && `${n.name || ''} ${n.id}`.toLowerCase().includes(q)).slice(0,8); nodes.forEach(n => { const b = el('button','mc-result', `${n.name || n.id} · ${n.id}`); b.type = 'button'; b.onclick = () => { this.search.value = ''; this.renderSearch(); this.select(`dm:${n.id}`); }; this.results.append(b); }); }
    render() {
      if (!this.list) return; this.list.replaceChildren(); const keys = this.keys(); let total = 0;
      keys.forEach(k => { const unread = this.saved.unread[k] || 0; total += unread; const row = el('div', 'mc-row' + (this.active === k ? ' active' : '')); const open = el('button', 'mc-open'); open.type = 'button'; open.append(el('span','mc-name', (k.startsWith('ch:') ? '# ' : '● ') + this.label(k))); const a = this.messages[k] || []; if (a.length) open.append(el('span','mc-preview', a[a.length-1].text || '')); if (unread) open.append(el('span','mc-count', String(unread))); open.onclick = () => this.select(k); const pin = el('button','mc-pin', this.saved.pins.includes(k) ? '★' : '☆'); pin.type = 'button'; pin.title = this.saved.pins.includes(k) ? 'Unpin conversation' : 'Pin conversation'; pin.setAttribute('aria-label', pin.title); pin.onclick = () => { const i = this.saved.pins.indexOf(k); if (i < 0) this.saved.pins.push(k); else this.saved.pins.splice(i,1); this.save(); this.render(); }; row.append(open,pin); this.list.append(row); });
      this.bell.textContent = `🔔 ${total}`; this.bell.setAttribute('aria-label', `${total} unread messages`); const grip = this.panel.querySelector('.panel-grip-name'); if (grip) grip.textContent = `💬 Map Chat${total ? ` (${total})` : ''}`; this.heading.replaceChildren(); if (this.active.startsWith('dm:')) { const id = this.active.slice(3); const name = el('button', 'mc-node-link mc-heading-link', this.label(this.active)); name.type = 'button'; name.title = 'View node details'; name.onclick = () => this.openNodeDetails(id, name); this.heading.append(name, document.createTextNode(' · Direct message')); } else this.heading.textContent = this.label(this.active) + ' · Channel';
      const nearBottom = this.feed.scrollHeight - this.feed.scrollTop - this.feed.clientHeight < 60; this.feed.replaceChildren(); const items = this.messages[this.active] || [];
      if (!items.length) this.feed.append(el('div','mc-empty','No messages yet'));
      const nodes = [...this.api.nodes.getAll(), ...this.api.nodes.getNoPosition()];
      items.forEach(m => { const own = m.from_id === this.tracker; const box = el('div', 'mc-message' + (own ? ' own' : '')); const head = el('div','mc-meta'); if (!own && m.from_id) { const sender = el('button', 'mc-node-link', this.senderName(m, nodes)); sender.type = 'button'; sender.title = 'View node details'; sender.onclick = () => this.openNodeDetails(m.from_id, sender); head.append(sender); } else head.append(document.createTextNode('You')); head.append(document.createTextNode(` · ${m.timestamp ? new Date(m.timestamp * 1000).toLocaleString() : ''}`)); const text = el('div','mc-text',m.text || ''); box.append(head,text); if (own && m.delivery_status) { const labels = {sending:'Sending…', submitted:'Submitted', relayed:'Relayed · awaiting recipient', unconfirmed:'Relayed · recipient not confirmed', delivered_mesh:'Delivered to mesh', delivered_recipient:'Delivered to recipient', failed:'Send failed', unknown:'Delivery unknown'}; const state = el('div','mc-meta mc-delivery', this.deliveryLabel(m) || labels[m.delivery_status] || m.delivery_status); if (Object.prototype.hasOwnProperty.call(labels, m.delivery_status)) state.classList.add('mc-delivery-' + m.delivery_status); if (m.delivery_error) state.title = m.delivery_error; box.append(state); } if (!own && !m.is_dm && m.from_id) { const reply = el('button','mc-reply','Reply privately'); reply.type = 'button'; reply.onclick = () => this.select(`dm:${m.from_id}`); box.append(reply); } this.feed.append(box); });
      if (nearBottom) this.feed.scrollTop = this.feed.scrollHeight; this.send.disabled = !this.online || this.pending;
    }
    sendMessage() { const text = this.input.value.trim(); if (!text || !this.online || this.pending) return; const isDM = this.active.startsWith('dm:'); const channel = isDM ? Number(((this.messages[this.active] || []).slice(-1)[0] || {}).channel_index || 0) : Number(this.active.slice(3)); this.sentKey = this.active; this.sentText = this.input.value; this.pending = true; this.status.textContent = 'Sending…';
      const bytes = new Uint8Array(16); if (window.crypto && window.crypto.getRandomValues) window.crypto.getRandomValues(bytes); else for (let i=0;i<16;i++) bytes[i] = Math.floor(Math.random()*256);
      bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
      const hex = Array.from(bytes, b => b.toString(16).padStart(2,'0')).join('');
      this.sentId = `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
      this.add({from_id:this.tracker, to_id:isDM ? this.active.slice(3) : '^all', text, channel_index:channel, is_dm:isDM, timestamp:Math.floor(Date.now()/1000), message_id:this.sentId, delivery_status:'sending', delivery_revision:0}, false);
      this.api.messages.sendTracked(text, isDM ? this.active.slice(3) : null, channel, this.sentId).then(result => this.sendResult(result), error => this.sendResult({success:false, message:error.message})); this.render(); }
    onDisable() { this.dead = true; clearTimeout(this.timer); if (this.sizeObserver) this.sizeObserver.disconnect(); if (this.unsubscribe) this.unsubscribe(); this.api.panels.unregister(this.panel); }
  }
  window.MeshPlugin = MapChat;
})();
