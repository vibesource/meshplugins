(function () {
  'use strict';
  const channel = 'plugin:vibesource/device-metrics:metrics';
  const key = 'device-metrics-view-v1';
  const $ = id => document.getElementById(id);
  const fields = [ ['battery','Battery','%'], ['voltage','Voltage',' V'], ['channel_util','Channel utilisation','%'], ['air_util_tx','Air utilisation','%'] ];
  let saved = {}; try { saved = JSON.parse(localStorage.getItem(key)) || {}; } catch (_) {}
  if ([3600,86400,604800,1209600,2592000,31536000].includes(saved.range)) $('range').value = saved.range;
  if ([3600,10800,21600,43200,86400].includes(saved.interval)) $('interval').value = saved.interval;
  $('telemetry-only').checked = saved.telemetryOnly === true;
  let ws, sequence = 0, pending = new Map(), samples = [], latestSample = null, nodes = [], retry, requestGeneration = 0;
  function save() { saved = {...saved,node:$('node').value || saved.node || '',range:Number($('range').value),interval:Number($('interval').value),telemetryOnly:$('telemetry-only').checked}; try { localStorage.setItem(key, JSON.stringify(saved)); } catch (_) {} }
  function rpc(action, extra={}) { return new Promise((resolve,reject)=>{ if (!ws || ws.readyState !== WebSocket.OPEN) return reject(new Error('Not connected')); const req=String(++sequence); const timer=setTimeout(()=>{pending.delete(req);reject(new Error('Request timed out'));},10000); pending.set(req,{resolve,reject,timer}); ws.send(JSON.stringify({type:'plugin_message',channel,data:{req,action,...extra}})); }); }
  function connect() {
    const url = location.protocol === 'https:' ? `wss://${location.host}/meshpulse-ws` : `ws://${location.hostname}:8765`;
    ws = new WebSocket(url);
    ws.onopen = async () => { $('connection').textContent='Connected'; ws.send(JSON.stringify({type:'subscribe_plugin',channel})); await refreshNodes(); };
    ws.onclose = () => { $('connection').textContent='Disconnected'; for(const p of pending.values()){clearTimeout(p.timer);p.reject(new Error('Disconnected'));} pending.clear(); clearTimeout(retry);retry=setTimeout(connect,3000); };
    ws.onerror = () => ws.close();
    ws.onmessage = e => { let msg; try {msg=JSON.parse(e.data);} catch (_) {return;} if(msg.type!=='plugin_data'||msg.channel!==channel||!msg.data)return; const p=pending.get(String(msg.data.req));if(!p)return;pending.delete(String(msg.data.req));clearTimeout(p.timer);msg.data.error?p.reject(new Error(msg.data.error)):p.resolve(msg.data); };
  }
  async function refreshNodes() { try { const result=await rpc('nodes');nodes=result.nodes || [];const select=$('node'), previous=select.value || saved.node, visible=$('telemetry-only').checked ? nodes.filter(n=>n.last_sample != null) : nodes;select.replaceChildren();if(!visible.length){select.add(new Option($('telemetry-only').checked?'No nodes with recorded telemetry':'No nodes available',''));select.disabled=true;requestGeneration++;samples=[];latestSample=null;render();$('status').textContent=$('telemetry-only').checked?'No recorded telemetry yet.':'Waiting for known nodes and telemetry.';save();return;}select.disabled=false;for(const n of visible)select.add(new Option(`${n.name} · ${n.id}`,n.id));select.value=visible.some(n=>n.id===previous)?previous:visible[0].id;await refreshHistory(); } catch(e){$('status').textContent=e.message;} }
  async function refreshHistory(){const node=$('node').value;if(!node)return;save();const generation=++requestGeneration;$('status').textContent='Loading…';try{const data=await rpc('history',{node_id:node,seconds:Number($('range').value)});if(generation!==requestGeneration)return;samples=data.samples || [];latestSample=data.latest || null;render();$('status').textContent=data.truncated?'Showing the most recent 5,000 samples.':samples.length?`${samples.length} received sample${samples.length===1?'':'s'} in this range.`:'No samples in this range yet. Collection begins when this plugin receives telemetry.';}catch(e){if(generation===requestGeneration)$('status').textContent=e.message;}}
  function val(x,unit,id){return x==null?'—':(id==='battery' && x===101?'External power':`${Number(x.toFixed(id==='voltage'?2:1))}${unit}`);}
  function age(ts){const secs=Math.max(0,Math.floor(Date.now()/1000-ts));if(secs<60)return 'less than a minute ago';if(secs<3600)return `${Math.floor(secs/60)} min ago`;if(secs<86400)return `${Math.floor(secs/3600)} h ago`;return `${Math.floor(secs/86400)} d ago`;}
  function render(){const latest=$('latest'),charts=$('charts'),list=$('samples');latest.replaceChildren();charts.replaceChildren();list.replaceChildren();const last=latestSample;if(!last)return;const stamp=document.createElement('p');stamp.className='muted';stamp.textContent=`Latest sample received: ${age(last.ts)} (${new Date(last.ts*1000).toLocaleString()})`;latest.append(stamp);for(const [id,label,unit] of fields){const card=document.createElement('div');card.className='metric';card.append(document.createTextNode(label));const v=document.createElement('strong');v.textContent=val(last[id],unit,id);card.append(v);latest.append(card);}chart(charts,'battery','Battery and voltage','%');chart(charts,'channel_util','Channel utilisation','%');chart(charts,'air_util_tx','Air utilisation','%');if(last.uptime!=null){const card=document.createElement('div');card.className='metric';card.textContent='Uptime';const v=document.createElement('strong');v.textContent=`${Math.floor(last.uptime/86400)}d ${Math.floor(last.uptime%86400/3600)}h`;card.append(v);latest.append(card);}for(const sample of [...samples].reverse().slice(0,500)){const item=document.createElement('div');item.className='sample';const t=document.createElement('time');t.dateTime=new Date(sample.ts*1000).toISOString();t.textContent=new Date(sample.ts*1000).toLocaleString();const v=document.createElement('span');v.className='sample-values';v.textContent=fields.filter(([id])=>sample[id]!=null).map(([id,label,unit])=>`${label}: ${val(sample[id],unit,id)}`).join(' · ');item.append(t,v);list.append(item);}}
  function chart(host,id,label,unit){
    const specs=id==='battery' ? [['battery','Battery','%'],['voltage','Voltage',' V']] : [[id,label,unit]];
    const series=specs.map(([key,name,suffix])=>({key,name,suffix,points:samples.filter(s=>s[key]!=null && (key!=='battery' || (s[key]>=0 && s[key]<=100)))})).filter(s=>s.points.length);
    if(!series.length)return;
    const all=series.flatMap(s=>s.points), minT=Math.min(...all.map(p=>p.ts)), maxT=Math.max(...all.map(p=>p.ts));
    const volts=series.find(s=>s.key==='voltage'), vmin=volts?Math.min(3,...volts.points.map(p=>p.voltage)):3, vmax=volts?Math.max(4.5,...volts.points.map(p=>p.voltage)):4.5;
    const box=document.createElement('div');box.className='chart';box.dataset.metric=id;
    const title=document.createElement('h3');title.textContent=label;box.append(title);
    const NS='http://www.w3.org/2000/svg', svg=document.createElementNS(NS,'svg');svg.setAttribute('viewBox','0 0 360 160');svg.setAttribute('role','group');svg.setAttribute('aria-label',`${label} over time. Select a point for details.`);
    const detail=document.createElement('p');detail.className='point-detail';detail.setAttribute('aria-live','polite');detail.textContent='Hover over or tap a point for details.';
    const x=t=>42+(maxT===minT?138:(t-minT)/(maxT-minT)*276), y=(v,key)=>135-(key==='voltage'?(v-vmin)/(vmax-vmin):v/100)*110;
    function elem(tag,attrs,text){const el=document.createElementNS(NS,tag);for(const [k,v] of Object.entries(attrs))el.setAttribute(k,v);if(text!==undefined)el.textContent=text;svg.append(el);return el;}
    elem('path',{d:'M42 25 V135 H318'+(id==='battery'?' V25':''),class:'axis'});
    for(const [v,yy] of [[100,25],[0,135]])elem('text',{x:36,y:yy+3,'text-anchor':'end',class:'axis-percent'},`${v}%`);
    if(id==='battery'){
      for(const [v,yy] of [[vmax,25],[vmin,135]])elem('text',{x:323,y:yy+3,class:'axis-voltage'},`${Number(v.toFixed(2))} V`);
      elem('line',{x1:42,x2:318,y1:y(20,'battery'),y2:y(20,'battery'),class:'low-warning'});
      elem('text',{x:45,y:y(20,'battery')-3,class:'warning-label'},'20%');
    }
    for(const [t,xx,anchor] of [[minT,42,'start'],[maxT,318,'end']])elem('text',{x:xx,y:153,'text-anchor':anchor},new Date(t*1000).toLocaleDateString()+' '+new Date(t*1000).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}));
    for(const item of series){
      for(let i=1;i<item.points.length;i++){const a=item.points[i-1],b=item.points[i];elem('line',{x1:x(a.ts),y1:y(a[item.key],item.key),x2:x(b.ts),y2:y(b[item.key],item.key),class:`series series-${item.key}`+(b.ts-a.ts>Number($('interval').value)*2?' gap':'')});}
      for(const point of item.points){const description=`${new Date(point.ts*1000).toLocaleString()} · ${item.name}: ${val(point[item.key],item.suffix,item.key)}`;const c=elem('circle',{cx:x(point.ts),cy:y(point[item.key],item.key),r:3,class:`plot-point point-${item.key}`,tabindex:0,role:'button','aria-label':description});const show=()=>{detail.textContent=description;};c.addEventListener('pointerenter',show);c.addEventListener('focus',show);c.addEventListener('click',show);}
    }
    box.append(svg,detail);if(id==='battery'){const legend=document.createElement('p');legend.className='chart-legend';legend.textContent='Battery % (left) · Voltage V (right). Voltage scale starts at 3–4.5 V and expands for readings outside it.';box.append(legend);}host.append(box);
  }
  setInterval(()=>{if(ws && ws.readyState===WebSocket.OPEN)refreshNodes();},60000);
  $('telemetry-only').addEventListener('change',()=>{save();refreshNodes();});
  $('node').addEventListener('change',refreshHistory);$('range').addEventListener('change',refreshHistory);$('interval').addEventListener('change',()=>{save();render();});connect();
})();
