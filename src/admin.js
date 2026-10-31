export async function adminPage({user,go,onUnauthorized,logout,esc,formatSize}) {
 const app=document.querySelector('#app');
 let tab='users',page=1,rows=[],search='';
 app.innerHTML=`<main class="admin-shell"><header class="topbar"><a class="brand" data-route href="/">loosupunda.</a><div class="account"><a data-route href="/">My library</a><button class="text-btn" id="admin-out">Sign out</button></div></header><section class="page-head"><div><span class="eyebrow">SITE ADMINISTRATION</span><h1>A little more oversight.</h1><p>Manage your community and the images they collect.</p></div><span class="admin-badge">Admin workspace</span></section><div id="admin-message" class="message" role="status" aria-live="polite"></div><section id="admin-content"><div class="loading"></div></section></main>`;
 const content=app.querySelector('#admin-content'),msg=app.querySelector('#admin-message');
 app.querySelector('#admin-out').onclick=()=>logout().catch(e=>{msg.textContent=e.message;});
 const request=async(resource='',options={},id='')=>{
  const response=await fetch(`/api/admin?resource=${resource}&page=${page}${id?'&id='+encodeURIComponent(id):''}`,{credentials:'same-origin',...options});
  const data=await response.json();
  if(response.status===401){onUnauthorized();throw Error('Please sign in again.');}
  if(!response.ok)throw Error(data.error||'Please try again.');return data;
 };
 function controls(){
  content.innerHTML=`<nav class="auth-tabs" aria-label="Admin sections"><button data-tab="users" class="${tab==='users'?'selected':''}">Users</button><button data-tab="images" class="${tab==='images'?'selected':''}">All images</button></nav><div class="toolbar"><input id="admin-search" class="search" type="search" aria-label="Search this page" placeholder="Search ${tab==='users'?'name or email':'image name or owner ID'}…"><button class="btn secondary" id="admin-refresh">Refresh</button></div><p class="muted" id="admin-count"></p><div id="admin-rows"></div><div class="admin-pagination" ${tab==='users'?'':'hidden'}><button class="btn secondary" id="previous" ${page===1?'disabled':''}>Previous</button><span>Page ${page}</span><button class="btn secondary" id="next" ${rows.length<50?'disabled':''}>Next</button></div><dialog id="admin-confirm"><h2 id="confirm-title"></h2><p id="confirm-description"></p><button class="btn secondary" id="admin-cancel">Cancel</button> <button class="btn" id="admin-confirm-action">Confirm</button></dialog>`;
  content.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{tab=b.dataset.tab;page=1;search='';load();});
  content.querySelector('#admin-search').value=search;
  content.querySelector('#admin-search').oninput=e=>{search=e.target.value;paint();};
  content.querySelector('#admin-refresh').onclick=load;
  content.querySelector('#previous').onclick=()=>{page--;load();};
  content.querySelector('#next').onclick=()=>{page++;load();};paint();
 }
 function confirm(title,description,action){
  const dialog=content.querySelector('#admin-confirm');
  content.querySelector('#confirm-title').textContent=title;
  content.querySelector('#confirm-description').textContent=description;
  content.querySelector('#admin-cancel').onclick=()=>dialog.close();
  content.querySelector('#admin-confirm-action').onclick=async e=>{e.target.disabled=true;try{await action();dialog.close();await load();msg.textContent='Changes saved.';}catch(error){msg.textContent=error.message;dialog.close();}finally{e.target.disabled=false;}};
  dialog.showModal();
 }
 function paint(){
  const list=rows.filter(r=>(tab==='users'?`${r.name||''} ${r.email||''}`:`${r.name} ${r.ownerId}`).toLowerCase().includes(search.toLowerCase()));
  content.querySelector('#admin-count').textContent=`${list.length} ${tab} shown${tab==='users'?' on this page':''}`;
  const container=content.querySelector('#admin-rows');
  if(!list.length){container.innerHTML='<div class="empty"><h2>Nothing to show yet.</h2><p>Try another search or refresh to check for updates.</p></div>';return;}
  if(tab==='users'){
   container.innerHTML=`<div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Account</th><th>Status</th><th>Role</th><th>Manage</th></tr></thead><tbody>${list.map(r=>`<tr><td><strong>${esc(r.name||r.email||'Unnamed account')}</strong><small>${esc(r.email)}</small><small>${esc(r.id)}</small></td><td>${r.confirmed?'Confirmed':'Awaiting confirmation'}</td><td>${r.roles.includes('admin')?'Admin':'Member'}</td><td>${r.id===user.id?'Your account':`<button class="btn secondary" data-role="${esc(r.id)}">${r.roles.includes('admin')?'Remove admin':'Make admin'}</button> <button class="text-btn" data-user-delete="${esc(r.id)}">Delete account</button>`}</td></tr>`).join('')}</tbody></table></div>`;
   container.querySelectorAll('[data-role]').forEach(b=>b.onclick=()=>{const r=rows.find(r=>r.id===b.dataset.role),grant=!r.roles.includes('admin');confirm(grant?'Grant administrator access?':'Remove administrator access?',`${r.email||r.id} ${grant?'will be able to manage every user and image.':'will return to member access.'}`,()=>request('users',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({admin:grant})},r.id));});
   container.querySelectorAll('[data-user-delete]').forEach(b=>b.onclick=()=>confirm('Delete this account?','This permanently deletes the account. Remove their images first from All images using their owner ID.',()=>request('users',{method:'DELETE'},b.dataset.userDelete)));
  } else {
   container.innerHTML='<div class="grid">'+list.map(r=>`<article class="card"><a href="/api/admin?resource=images&id=${encodeURIComponent(r.id)}" target="_blank" rel="noopener"><img src="/api/admin?resource=images&id=${encodeURIComponent(r.id)}" alt="${esc(r.name)}" loading="lazy"></a><div class="card-info"><h3>${esc(r.name)}</h3><p>${formatSize(r.size)}</p><p class="owner-id">Owner: ${esc(r.ownerId)}</p><div class="card-actions"><button data-image-delete="${esc(r.id)}">Delete image</button></div></div></article>`).join('')+'</div>';
   container.querySelectorAll('[data-image-delete]').forEach(b=>b.onclick=()=>confirm('Delete this image?','This permanently removes the image from its owner’s library.',()=>request('images',{method:'DELETE'},b.dataset.imageDelete)));
  }
 }
 async function load(){
  msg.textContent='';content.innerHTML='<div class="loading"></div>';
  try{rows=await request(tab);if(!app.contains(content))return;controls();}catch(error){if(!app.contains(content))return;msg.textContent=error.message;content.innerHTML='<div class="empty"><h2>Admin workspace unavailable</h2><p>Administrator access is required to manage this site.</p><button class="btn secondary" id="admin-retry">Try again</button></div>';content.querySelector('#admin-retry').onclick=load;}
 }
 try{await request();if(app.contains(content))await load();}catch(error){if(app.contains(content)){msg.textContent=error.message;content.innerHTML='<div class="empty"><h2>Administrator access required</h2><p>The site owner can assign the admin role in Netlify Identity. Sign out and sign in again after access is granted.</p><a class="btn secondary" data-route href="/">Back to my library</a></div>';}}
}
