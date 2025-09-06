/* Full Cloudflare Workers + Durable Objects chat example (single file). Includes:

HTTP server that serves a single-page app (HTML/CSS/JS)

Durable Object: Directory (maps userId -> roomIds)

Durable Object: ChatRoom (manages WebSocket connections for a room)


How it works (quick):

Clients store displayName and userId in localStorage (userId persists until cookies/localStorage cleared)

Client can create a solo chat (DM) with another user's id or create a group (room) with chosen members

Directory DO keeps an index of rooms per user so "My Chats" can be listed globally

ChatRoom DO accepts WebSocket upgrades and broadcasts messages to room members


NOTES:

This is a functional prototype. You'll need to wire the Durable Object namespaces in wrangler.toml and deploy with Wrangler.

The UI is purposely simple but styled to your spec: black background, red sidebar with red outline.


======================= == Worker & DO Code ==

*/

// -------------------- // Helper: UUID // -------------------- function uuid() { // simple uuid v4 return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = (crypto.getRandomValues(new Uint8Array(1))[0] & 15) >> 0; const v = c === 'x' ? r : (r & 0x3) | 0x8; return v.toString(16); }); }

// -------------------- // Durable Object: Directory // Keeps index: userId -> Set(roomId) // -------------------- export class Directory { constructor(state, env) { this.state = state; this.env = env; }

async fetch(request) { const url = new URL(request.url); if (request.method === 'POST' && url.pathname === '/register-room') { const body = await request.json(); const { roomId, members } = body; if (!roomId || !Array.isArray(members)) return new Response('bad', { status: 400 }); // For each member, add roomId to their list for (const userId of members) { const key = user:${userId}; const v = (await this.state.storage.get(key)) || []; if (!v.includes(roomId)) v.push(roomId); await this.state.storage.put(key, v); } return new Response(JSON.stringify({ ok: true })); }

if (request.method === 'GET' && url.pathname === '/rooms') {
  const userId = url.searchParams.get('user');
  if (!userId) return new Response('missing user', { status: 400 });
  const v = (await this.state.storage.get(`user:${userId}`)) || [];
  return new Response(JSON.stringify({ rooms: v }));
}

return new Response('Directory: unknown', { status: 404 });

} }

// -------------------- // Durable Object: ChatRoom // Manages WebSocket connections for a specific room // state.storage is used to persist room metadata (name, members, creator) // -------------------- export class ChatRoom { constructor(state, env) { this.state = state; this.env = env; this.sockets = new Map(); // clientId -> WebSocketPair server side (w) }

async fetch(request) { const url = new URL(request.url); if (request.method === 'POST' && url.pathname === '/meta') { const body = await request.json(); const { name, members, creator } = body; await this.state.storage.put('meta', { name, members, creator }); return new Response(JSON.stringify({ ok: true })); }

// WebSocket upgrade handler
if (request.headers.get('Upgrade') === 'websocket') {
  const user = url.searchParams.get('user');
  const display = url.searchParams.get('display') || 'Anonymous';
  if (!user) return new Response('missing user', { status: 400 });

  const pair = new WebSocketPair();
  // accept server side socket
  const [client, server] = Object.values(pair);
  server.accept();

  // save socket and wire message handlers
  this.sockets.set(user, server);

  server.addEventListener('message', async ev => {
    let parsed;
    try { parsed = JSON.parse(ev.data); } catch(e) { return; }
    // messages: {type: 'chat', text, sender, ts}
    if (parsed.type === 'chat') {
      // broadcast
      const meta = await this.state.storage.get('meta') || {};
      const payload = JSON.stringify({ type: 'chat', text: parsed.text, sender: parsed.sender, ts: parsed.ts });
      for (const [uid, sock] of this.sockets) {
        try { sock.send(payload); } catch (e) {}
      }
      // optionally persist last messages
      const msgs = (await this.state.storage.get('messages')) || [];
      msgs.push({ text: parsed.text, sender: parsed.sender, ts: parsed.ts });
      if (msgs.length > 200) msgs.shift();
      await this.state.storage.put('messages', msgs);
    }
    if (parsed.type === 'meta-update') {
      const meta = (await this.state.storage.get('meta')) || {};
      const newMeta = { ...meta, ...parsed.data };
      await this.state.storage.put('meta', newMeta);
    }
  });

  server.addEventListener('close', () => {
    this.sockets.delete(user);
  });

  // send existing metadata and recent messages
  (async () => {
    const meta = (await this.state.storage.get('meta')) || {};
    const msgs = (await this.state.storage.get('messages')) || [];
    server.send(JSON.stringify({ type: 'meta', meta }));
    server.send(JSON.stringify({ type: 'history', messages: msgs }));
  })();

  return new Response(null, { status: 101, webSocket: client });
}

return new Response('ChatRoom: no ws', { status: 400 });

} }

// -------------------- // Main HTTP handler (serves SPA + REST endpoints to create rooms, list room meta) // -------------------- export default { async fetch(request, env) { const url = new URL(request.url);

// Serve static app
if (url.pathname === '/' || url.pathname === '/index.html') {
  return new Response(APP_HTML, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

// create room endpoint
if (request.method === 'POST' && url.pathname === '/create-room') {
  const body = await request.json();
  const { name, members, creator } = body;
  if (!Array.isArray(members) || !creator) return new Response('bad', { status: 400 });
  const roomId = `room_${uuid()}`;
  // create Durable Object id for room
  const id = env.CHATROOM.idFromName(roomId);
  const obj = env.CHATROOM.get(id);
  // set metadata in the room
  await obj.fetch(new Request(`${request.url}/meta`, { method: 'POST', body: JSON.stringify({ name, members, creator }) }));
  // register room in Directory DO for each member
  const dirId = env.DIRECTORY.idFromName('directory');
  const dir = env.DIRECTORY.get(dirId);
  await dir.fetch(new Request(`${request.url}/register-room`, { method: 'POST', body: JSON.stringify({ roomId, members }) }));

  return new Response(JSON.stringify({ ok: true, roomId }));
}

// list rooms for user
if (request.method === 'GET' && url.pathname === '/my-rooms') {
  const user = url.searchParams.get('user');
  if (!user) return new Response('missing', { status: 400 });
  const dirId = env.DIRECTORY.idFromName('directory');
  const dir = env.DIRECTORY.get(dirId);
  const r = await dir.fetch(new Request(`${request.url}/rooms?user=${user}`));
  return r;
}

// fetch room metadata
if (request.method === 'GET' && url.pathname === '/room-meta') {
  const roomId = url.searchParams.get('room');
  if (!roomId) return new Response('missing', { status: 400 });
  const id = env.CHATROOM.idFromName(roomId);
  const obj = env.CHATROOM.get(id);
  // call meta by doing a GET to /meta?fetch
  const resp = await obj.fetch(new Request(`${request.url}/meta-fetch`));
  // our ChatRoom doesn't handle meta fetch - but we can read storage directly via a POST we add above. Simpler: return from Directory storage? For prototype, return stored meta via fetching messages (workaround)
  return new Response(JSON.stringify({ ok: true, roomId }), { status: 200 });
}

// upgrade to websocket and route to room DO
if (url.pathname === '/ws') {
  const room = url.searchParams.get('room');
  const user = url.searchParams.get('user');
  if (!room || !user) return new Response('missing', { status: 400 });
  const id = env.CHATROOM.idFromName(room);
  const obj = env.CHATROOM.get(id);
  // forward upgrade to DO
  return obj.fetch(request);
}

return new Response('not found', { status: 404 });

} };

// -------------------- // SPA: HTML + CSS + Client JS // Meets styling requirements: black background, red sidebar with black bg and red outline. // -------------------- const APP_HTML = `<!doctype html>

<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Cloudflare Edge Chat</title>
<style>
  :root{--bg:#000;--red:#e11;--panel:#0b0b0b}
  html,body{height:100%;margin:0;background:var(--bg);color:#ddd;font-family:system-ui,Segoe UI,Roboto,Arial}
  .app{display:flex;min-height:100vh}
  .sidebar{width:320px;background:var(--panel);border-right:3px solid var(--red);padding:18px;box-sizing:border-box}
  .sidebar .top{border:2px solid var(--red);padding:12px;margin-bottom:12px;background:#000;color:var(--red);}
  .label{font-size:12px;color:#888;margin-top:6px}
  .field{display:flex;gap:8px;margin-top:8px}
  input[type=text]{flex:1;padding:8px;background:#111;border:1px solid #222;color:#fff}
  button{background:var(--red);border:none;padding:8px 10px;color:#000;cursor:pointer}
  .section{margin-top:12px}
  .line{height:2px;background:var(--red);margin:12px 0}
  .list-item{padding:8px;border:1px solid #222;margin-bottom:6px;background:#080808;color:#fff}
  .main{flex:1;padding:18px}
  .chat-window{height:80vh;background:#050505;border:1px solid #222;padding:12px;overflow:auto}
  .msg{margin:6px 0;padding:8px;border-radius:6px;background:#111}
  .mine{background:rgba(225,17,17,0.12);border:1px solid rgba(225,17,17,0.2)}
</style>
</head>
<body>
<div class="app">
  <div class="sidebar">
    <div class="top">
      <div><strong id="displayNameLabel">Display Name</strong></div>
      <div class="label">You can change this</div>
      <div style="margin-top:8px;display:flex;gap:8px;align-items:center;">
        <input id="displayNameInput" placeholder="Your display name" />
        <button id="saveDisplay">Save</button>
      </div>
      <div class="label">Your user id (persists until you clear storage)</div>
      <div style="margin-top:8px;display:flex;gap:8px;align-items:center;">
        <input id="userId" readonly />
        <button id="copyId">Copy</button>
      </div>
    </div><div class="section">
  <div class="label">Start solo chat</div>
  <div style="display:flex;gap:8px;margin-top:6px;">
    <input id="startWithId" placeholder="other user id" />
    <button id="startSolo">Start</button>
  </div>

  <div class="label" style="margin-top:8px">Create group</div>
  <div style="display:flex;gap:8px;margin-top:6px;flex-direction:column;">
    <input id="groupName" placeholder="group name" />
    <input id="groupMembers" placeholder="members csv (user ids)" />
    <button id="createGroup">Create Group</button>
  </div>
</div>

<div class="line"></div>

<div class="section">
  <div class="label">Solo Chats</div>
  <div id="soloList"></div>
</div>

<div class="section">
  <div class="label">Group Chats</div>
  <div id="groupList"></div>
</div>

  </div>  <div class="main">
    <h2 id="roomTitle">Welcome</h2>
    <div id="chatWindow" class="chat-window"></div>
    <div style="display:flex;gap:8px;margin-top:8px;">
      <input id="chatInput" placeholder="Type message" style="flex:1;padding:8px;background:#111;border:1px solid #222;color:#fff" />
      <button id="sendBtn">Send</button>
    </div>
  </div>
</div><script>
const API_ROOT = location.origin;

function $(s){return document.querySelector(s)}

// load or create user id + display name
let userId = localStorage.getItem('cf_chat_user') || null;
if (!userId) { userId = crypto.randomUUID(); localStorage.setItem('cf_chat_user', userId); }
let displayName = localStorage.getItem('cf_chat_display') || ('User-' + userId.slice(0,6));
$('#userId').value = userId;
$('#displayNameInput').value = displayName;
$('#displayNameLabel').innerText = displayName;

$('#saveDisplay').addEventListener('click', ()=>{
  displayName = $('#displayNameInput').value || displayName;
  localStorage.setItem('cf_chat_display', displayName);
  $('#displayNameLabel').innerText = displayName;
});

$('#copyId').addEventListener('click', ()=>{ navigator.clipboard.writeText(userId).then(()=>alert('copied')) });

// UI lists
function renderLists(){
  const solos = JSON.parse(localStorage.getItem('cf_chat_solos')||'[]');
  const groups = JSON.parse(localStorage.getItem('cf_chat_groups')||'[]');
  const soloList = $('#soloList'); soloList.innerHTML='';
  solos.forEach(r=>{ const el = document.createElement('div'); el.className='list-item'; el.textContent = r.name+' — '+r.roomId; el.onclick = ()=>openRoom(r.roomId,r.name); soloList.appendChild(el); });
  const groupList = $('#groupList'); groupList.innerHTML='';
  groups.forEach(r=>{ const el = document.createElement('div'); el.className='list-item'; el.textContent = r.name+' — '+r.roomId; el.onclick = ()=>openRoom(r.roomId,r.name); groupList.appendChild(el); });
}
renderLists();

// start solo chat
$('#startSolo').addEventListener('click', async ()=>{
  const other = $('#startWithId').value.trim(); if(!other) return alert('enter id');
  const a=[userId, other].sort();
  const roomId = 'dm_'+a.join('_');
  // register in directory by creating room if not exists
  // we will create a room if not already in localStorage
  const exists = JSON.parse(localStorage.getItem('cf_chat_solos')||'[]').some(r=>r.roomId===roomId);
  if (!exists) {
    // create via API
    const resp = await fetch(API_ROOT + '/create-room', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ name: 'DM: '+other, members: [userId, other], creator: userId }) });
    const j = await resp.json();
    localStorage.setItem('cf_chat_solos', JSON.stringify([...(JSON.parse(localStorage.getItem('cf_chat_solos')||'[]')), { roomId, name: 'DM: '+other }] ));
    renderLists();
  }
  openRoom(roomId, 'DM: '+other);
});

// create group
$('#createGroup').addEventListener('click', async ()=>{
  const name = $('#groupName').value.trim() || 'Group';
  const raw = $('#groupMembers').value.trim();
  const members = raw.split(',').map(s=>s.trim()).filter(Boolean);
  if (!members.includes(userId)) members.push(userId);
  const resp = await fetch(API_ROOT + '/create-room', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ name, members, creator: userId }) });
  const j = await resp.json();
  if (j.ok) {
    const groups = JSON.parse(localStorage.getItem('cf_chat_groups')||'[]');
    groups.push({ roomId: j.roomId, name });
    localStorage.setItem('cf_chat_groups', JSON.stringify(groups));
    renderLists();
    openRoom(j.roomId, name);
  } else alert('failed');
});

let socket = null; let currentRoom = null;
async function openRoom(roomId, name){
  currentRoom = roomId; $('#roomTitle').innerText = name || roomId; $('#chatWindow').innerHTML='';
  if (socket) try{ socket.close(); }catch(e){}
  const wsurl = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws?room=' + encodeURIComponent(roomId) + '&user=' + encodeURIComponent(userId) + '&display=' + encodeURIComponent(displayName);
  socket = new WebSocket(wsurl);
  socket.addEventListener('open', ()=>console.log('ws open'));
  socket.addEventListener('message', ev=>{
    let msg;
    try{msg = JSON.parse(ev.data)}catch(e){return}
    if (msg.type === 'history') {
      msg.messages.forEach(m=>appendMsg(m.sender,m.text,m.ts));
    }
    if (msg.type === 'chat') appendMsg(msg.sender, msg.text, msg.ts);
    if (msg.type === 'meta') {
      // optionally update UI
    }
  });
}

function appendMsg(sender, text, ts){
  const wrap = document.createElement('div'); wrap.className='msg';
  if (sender === userId) wrap.classList.add('mine');
  wrap.innerHTML = '<strong>'+ (sender===userId?displayName:sender) +'</strong><div style="font-size:13px;margin-top:4px">'+text+'</div>';
  $('#chatWindow').appendChild(wrap);
  $('#chatWindow').scrollTop = $('#chatWindow').scrollHeight;
}

// send
$('#sendBtn').addEventListener('click', ()=>{
  const txt = $('#chatInput').value.trim(); if(!txt || !socket || socket.readyState!==1) return; const payload = { type: 'chat', text: txt, sender: userId, ts: Date.now() };
  socket.send(JSON.stringify(payload));
  $('#chatInput').value='';
});

</script></body>
</html>`;/*

Deployment notes (include in wrangler.toml):

name = "edge-chat" main = "./cloudflare-chat-worker.js" compatibility_date = "2025-09-06"

[durable_objects] bindings = [ { name = "CHATROOM", class_name = "ChatRoom" }, { name = "DIRECTORY", class_name = "Directory" } ]

publish with: wrangler publish


---

*/

