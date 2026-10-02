import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.4/+esm";

const SUPABASE_URL = "https://prgcrsxjypqogzlynyyv.supabase.co";
const SUPABASE_KEY = "sb_publishable_Q4M0NiyetnnwxXRE2gGLpg_VI9_CYwJ";
const NEWS_URL = `${SUPABASE_URL}/functions/v1/seven-news`;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const STATUS=["Planejamento","Roteiro","Captação","Edição / design","Aprovação","Publicação","Publicado"];
const FORMATS=["Reels","Stories","Carrossel","Live","Foto editorial","VSL curta","Depoimento","ASMR","Evento presencial"];
const app=document.querySelector("#app");

const state={
  page:"calendar", year:2026, month:9, search:"", person:"all", onlyOwing:false,
  payload:{team:[],items:[]}, revision:0, holidays:{}, news:null, newsUpdatedAt:null,
  connected:false, saving:false, modal:null, dragId:null, dragOver:null
};

const esc=s=>String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
const uuid=()=>crypto.randomUUID();
const fmt=iso=>{if(!iso)return"Sem prazo";const [y,m,d]=iso.split("-");return `${d}/${m}/${y}`};
const monthName=()=>new Intl.DateTimeFormat("pt-BR",{month:"long",year:"numeric"}).format(new Date(state.year,state.month,1));

function monthCells(year,month){
  const first=new Date(year,month,1), offset=(first.getDay()+6)%7, count=new Date(year,month+1,0).getDate(), prev=new Date(year,month,0).getDate();
  return Array.from({length:42},(_,i)=>{
    let rel=i-offset+1,d=rel,m=month,y=year,out=false;
    if(rel<1){d=prev+rel;m--;out=true;if(m<0){m=11;y--}}
    else if(rel>count){d=rel-count;m++;out=true;if(m>11){m=0;y++}}
    return {day:d,iso:`${y}-${String(m+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`,out};
  });
}
function lateness(due){
  if(!due)return -99999;
  const t=new Date();t.setHours(0,0,0,0);
  const d=new Date(`${due}T00:00:00`);
  return Number.isNaN(d.getTime())?-99999:Math.floor((t-d)/86400000);
}
function priorityLabel(days){
  if(days>0)return days===1?"1 dia atrasada":`${days} dias atrasada`;
  if(days===0)return"Vence hoje";
  if(days>-99999)return`Vence em ${Math.abs(days)} dia${Math.abs(days)===1?"":"s"}`;
  return"Sem prazo";
}
function shortHoliday(list){
  if(!list?.length)return null;
  return [...list].sort((a,b)=>a.length-b.length || a.localeCompare(b,"pt-BR"))[0];
}
function blankItem(date){
  return {id:uuid(),title:"",date:date||`${state.year}-${String(state.month+1).padStart(2,"0")}-01`,format:"Reels",type:"Conteúdo",owner:state.payload.team[0]?.id||"",status:"Planejamento",notes:"",done:false,deliveries:[],supportLinks:[]};
}
function openItem(id){
  const item=state.payload.items.find(x=>x.id===id);
  if(!item)return;
  state.modal={type:"item",value:structuredClone({...item,supportLinks:item.supportLinks||[]})};
  renderModal();
}
function openNew(date){state.modal={type:"item",value:blankItem(date)};renderModal()}
function openMember(id){
  const member=id?state.payload.team.find(x=>x.id===id):{id:uuid(),name:"",roles:[]};
  if(!member)return;
  state.modal={type:"member",value:structuredClone(member),exists:!!id};
  renderModal();
}
function closeModal(){state.modal=null;document.querySelector(".modal-backdrop")?.remove()}

async function loadWorkspace(){
  const {data,error}=await supabase.from("workspace_state").select("payload,revision,updated_at").eq("id","seven-main").single();
  if(error)throw error;
  state.payload=data.payload||{team:[],items:[]};
  state.revision=data.revision||0;
}
async function applyAction(input){
  state.saving=true; updateSync();
  const {data,error}=await supabase.rpc("apply_workspace_action",{input});
  state.saving=false;
  if(error){updateSync(true);throw error}
  if(data?.payload){state.payload=data.payload;state.revision=data.revision||state.revision+1}
  render(); updateSync();
  return data;
}
async function loadNews(){
  try{
    const r=await fetch(NEWS_URL,{headers:{apikey:SUPABASE_KEY}});
    if(!r.ok)throw new Error("news");
    const d=await r.json(); state.news=d.items||[]; state.newsUpdatedAt=d.updatedAt; renderNews();
  }catch{state.news=[];renderNews(true)}
}
function realtime(){
  supabase.channel("seven-workspace")
    .on("postgres_changes",{event:"UPDATE",schema:"public",table:"workspace_state",filter:"id=eq.seven-main"},payload=>{
      if(payload.new?.payload){state.payload=payload.new.payload;state.revision=payload.new.revision||state.revision+1;render()}
    })
    .subscribe(status=>{state.connected=status==="SUBSCRIBED";updateSync()});
}
function updateSync(forceOff=false){
  const dot=document.querySelector(".sync-dot"), txt=document.querySelector(".sync-text");
  if(!dot||!txt)return;
  const ok=state.connected&&!forceOff;
  dot.classList.toggle("off",!ok); txt.textContent=state.saving?"Salvando…":ok?"Sincronizado":"Reconectando";
}

function shell(){
  app.innerHTML=`
    <div class="app">
      <header class="topbar">
        <div class="brand">
          <div style="width:42px;height:42px;border-radius:12px;background:#153e2c;color:#fff;display:grid;place-items:center;font:800 22px var(--display)">7</div>
          <div><strong>SEVEN</strong><span>Assessoria de Crescimento</span></div>
        </div>
        <nav class="nav">
          <button data-page="calendar">Calendário</button>
          <button data-page="team">Equipe e operação</button>
          <button data-page="results">Resultados e direção</button>
        </nav>
        <div class="sync"><i class="sync-dot off"></i><span class="sync-text">Reconectando</span></div>
      </header>
      <main class="main" id="page"></main>
    </div>`;
  document.querySelectorAll("[data-page]").forEach(b=>b.addEventListener("click",()=>{state.page=b.dataset.page;render()}));
}
function render(){
  if(!document.querySelector(".topbar"))shell();
  document.querySelectorAll("[data-page]").forEach(b=>b.classList.toggle("active",b.dataset.page===state.page));
  if(state.page==="calendar")renderCalendar();
  if(state.page==="team")renderTeam();
  if(state.page==="results")renderResults();
  updateSync();
}

function metrics(){
  const monthItems=state.payload.items.filter(i=>{const d=new Date(`${i.date}T12:00:00`);return d.getFullYear()===state.year&&d.getMonth()===state.month});
  const complete=monthItems.filter(i=>i.done||i.status==="Publicado").length;
  const pct=monthItems.length?Math.round(complete/monthItems.length*100):0;
  const pending=monthItems.reduce((n,i)=>n+(i.deliveries||[]).filter(d=>d.status==="Pendente").length,0);
  return {monthItems,complete,pct,pending};
}
function renderCalendar(){
  const {monthItems,complete,pct,pending}=metrics();
  document.querySelector("#page").innerHTML=`
    <section class="hero"><div><p class="eyebrow">PLANEJAMENTO SEVEN</p><h1>Calendário editorial<b>.</b></h1><small>Um único calendário para toda a equipe, atualizado em tempo real.</small></div><button class="btn" id="new-item">＋ Nova pauta</button></section>
    <section class="metrics">
      <article class="metric progress"><div><span>Conclusão do mês</span><strong>${pct}%</strong></div><div class="progress-track"><i style="width:${pct}%"></i></div></article>
      <article class="metric"><span>Pautas</span><strong>${monthItems.length}</strong><small>${complete} concluídas</small></article>
      <article class="metric"><span>Entregas pendentes</span><strong>${pending}</strong><small>na equipe</small></article>
    </section>
    <section class="toolbar">
      <div class="month-nav"><button class="btn secondary icon" id="prev-month">‹</button><b>${esc(monthName())}</b><button class="btn secondary icon" id="next-month">›</button></div>
      <div class="search"><input id="search" value="${esc(state.search)}" placeholder="Buscar pauta"></div>
    </section>
    <div class="drag-help">☷ Arraste qualquer pauta para outro dia. O calendário cresce para baixo conforme você adiciona conteúdos.</div>
    <section class="calendar-wrap"><div class="weekdays">${["Seg","Ter","Qua","Qui","Sex","Sáb","Dom"].map(x=>`<span>${x}</span>`).join("")}</div><div class="calendar" id="calendar"></div></section>
    <section class="news"><div class="section-head"><div><p>EM ALTA AGORA</p><h2>5 notícias do momento</h2><span>Google Notícias Brasil, atualizado ao longo do dia.</span></div><div><small id="news-time"></small> <button class="btn secondary sm" id="refresh-news">Atualizar</button></div></div><div class="news-grid" id="news-grid"></div></section>`;
  document.querySelector("#new-item").onclick=()=>openNew();
  document.querySelector("#prev-month").onclick=()=>moveMonth(-1);
  document.querySelector("#next-month").onclick=()=>moveMonth(1);
  document.querySelector("#search").oninput=e=>{state.search=e.target.value;renderCalendarGrid()};
  document.querySelector("#refresh-news").onclick=loadNews;
  renderCalendarGrid(); renderNews();
}
function moveMonth(delta){
  const d=new Date(state.year,state.month+delta,1);state.year=d.getFullYear();state.month=d.getMonth();renderCalendar();
}
function renderCalendarGrid(){
  const cal=document.querySelector("#calendar"); if(!cal)return;
  const q=state.search.toLowerCase();
  cal.innerHTML=monthCells(state.year,state.month).map(c=>{
    const holidays=state.holidays[c.iso]||[], featured=shortHoliday(holidays);
    const items=state.payload.items.filter(i=>i.date===c.iso&&i.title.toLowerCase().includes(q));
    return `<article class="day ${c.out?"outside":""}" data-date="${c.iso}">
      <div class="holiday-bar">${featured?`<button data-holiday="${c.iso}"><span class="holiday-name">${esc(featured)}</span>${holidays.length>1?`<em>+${holidays.length-1}</em>`:""}</button>`:""}</div>
      <div class="day-head"><b>${String(c.day).padStart(2,"0")}</b><button data-new-date="${c.iso}" aria-label="Nova pauta em ${c.iso}">＋</button></div>
      <div class="cards">${items.map(cardHtml).join("")}</div>
    </article>`;
  }).join("");
  cal.querySelectorAll("[data-holiday]").forEach(b=>b.onclick=()=>{state.modal={type:"holiday",date:b.dataset.holiday};renderModal()});
  cal.querySelectorAll("[data-new-date]").forEach(b=>b.onclick=()=>openNew(b.dataset.newDate));
  cal.querySelectorAll("[data-edit]").forEach(b=>b.onclick=e=>{e.stopPropagation();openItem(b.dataset.edit)});
  cal.querySelectorAll("[data-delete]").forEach(b=>b.onclick=async e=>{e.stopPropagation();if(confirm("Excluir esta pauta?"))await applyAction({action:"deleteItem",id:b.dataset.delete})});
  cal.querySelectorAll(".card").forEach(card=>{
    card.addEventListener("dragstart",e=>{state.dragId=card.dataset.id;card.classList.add("dragging");e.dataTransfer.setData("text/plain",state.dragId);e.dataTransfer.effectAllowed="move"});
    card.addEventListener("dragend",()=>{state.dragId=null;document.querySelectorAll(".day").forEach(x=>x.classList.remove("drop-target"));card.classList.remove("dragging")});
  });
  cal.querySelectorAll(".day").forEach(day=>{
    day.addEventListener("dragover",e=>{e.preventDefault();document.querySelectorAll(".day").forEach(x=>x.classList.remove("drop-target"));day.classList.add("drop-target")});
    day.addEventListener("drop",async e=>{
      e.preventDefault();day.classList.remove("drop-target");
      const id=e.dataTransfer.getData("text/plain")||state.dragId;
      const item=state.payload.items.find(x=>x.id===id);
      if(item&&item.date!==day.dataset.date)await applyAction({action:"upsertItem",item:{...item,date:day.dataset.date,supportLinks:item.supportLinks||[]}});
    });
  });
}
function cardHtml(i){
  const owner=state.payload.team.find(x=>x.id===i.owner)?.name||"Sem dono";
  return `<div class="card ${i.done?"done":""}" draggable="true" data-id="${i.id}">
    <div class="card-top"><span>${esc(i.format)}</span><small>${esc(i.status)}</small></div>
    <h3>☷ ${esc(i.title)}</h3><div class="card-meta"><span>${esc(owner)}</span><span>${esc(i.type||"Conteúdo")}</span></div>
    <div class="card-actions"><button data-edit="${i.id}" title="Editar">✎</button><button data-delete="${i.id}" title="Excluir">×</button></div>
  </div>`;
}
function renderNews(error=false){
  const grid=document.querySelector("#news-grid"); if(!grid)return;
  const t=document.querySelector("#news-time");
  if(t)t.textContent=state.newsUpdatedAt?`Atualizado ${new Date(state.newsUpdatedAt).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit",timeZone:"America/Sao_Paulo"})}`:"";
  if(error){grid.innerHTML=`<div style="padding:24px">As notícias não puderam ser atualizadas agora.</div>`;return}
  if(state.news===null){grid.innerHTML=Array.from({length:5},()=>`<div class="news-card">Carregando…</div>`).join("");return}
  grid.innerHTML=state.news.map(n=>`<a class="news-card" href="${esc(n.url)}" target="_blank" rel="noreferrer"><div class="news-rank">${String(n.rank).padStart(2,"0")}</div><div class="source">${esc(n.source)}</div><h3>${esc(n.title)}</h3><small>${new Date(n.publishedAt).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit",timeZone:"America/Sao_Paulo"})}</small></a>`).join("");
}

function openTasks(){
  return state.payload.items.flatMap(item=>(item.deliveries||[]).filter(d=>d.status!=="Feito").map(delivery=>({item,delivery,responsible:state.payload.team.find(p=>p.id===delivery.person),daysLate:lateness(delivery.due)})))
    .filter(x=>state.person==="all"||x.delivery.person===state.person)
    .sort((a,b)=>b.daysLate-a.daysLate||(a.delivery.due||"").localeCompare(b.delivery.due||""));
}
function renderTeam(){
  const tasks=openTasks();
  document.querySelector("#page").innerHTML=`
    <section class="hero"><div><p class="eyebrow">DO PLANO PARA A VIDA REAL</p><h1>Equipe e operação<b>.</b></h1><small>Veja quem fez, quem está em dia, quem está pendente e qual é a próxima prioridade.</small></div><button class="btn" id="new-member">＋ Novo membro</button></section>
    <section class="team-filters"><select id="person-filter"><option value="all">Todas as pessoas</option>${state.payload.team.map(p=>`<option value="${p.id}" ${state.person===p.id?"selected":""}>${esc(p.name)}</option>`).join("")}</select><label><input type="checkbox" id="owing" ${state.onlyOwing?"checked":""}> Somente com pendências</label></section>
    <section class="people-grid" id="people"></section>
    <section class="open-tasks"><div class="section-head"><div><p>FILA DE PRIORIDADE</p><h2>Tarefas em aberto</h2><span>As mais atrasadas aparecem primeiro.</span></div><strong>${tasks.length}</strong></div><div class="task-table" id="tasks"></div></section>`;
  document.querySelector("#new-member").onclick=()=>openMember();
  document.querySelector("#person-filter").onchange=e=>{state.person=e.target.value;renderTeam()};
  document.querySelector("#owing").onchange=e=>{state.onlyOwing=e.target.checked;renderTeam()};
  renderPeople(); renderTasks();
}
function renderPeople(){
  const el=document.querySelector("#people"); if(!el)return;
  let people=state.payload.team;
  if(state.person!=="all")people=people.filter(p=>p.id===state.person);
  if(state.onlyOwing)people=people.filter(p=>openTasks().some(x=>x.delivery.person===p.id));
  el.innerHTML=people.map(p=>{
    const all=state.payload.items.flatMap(item=>(item.deliveries||[]).map(d=>({item,d}))).filter(x=>x.d.person===p.id);
    const did=all.filter(x=>x.d.status==="Feito").length, due=all.filter(x=>x.d.status==="Em dia").length, pend=all.filter(x=>x.d.status==="Pendente").length;
    const open=all.filter(x=>x.d.status!=="Feito").sort((a,b)=>lateness(b.d.due)-lateness(a.d.due)).slice(0,4);
    return `<article class="person-card"><button class="edit-person" data-member="${p.id}">✎</button><div class="person-head"><div class="avatar">${esc(p.name.split(/\s+/).map(x=>x[0]).join("").slice(0,2).toUpperCase())}</div><div><h3>${esc(p.name)}</h3><div class="role-chips">${(p.roles||[]).map(r=>`<span>${esc(r)}</span>`).join("")}</div></div></div><div class="person-stats"><div><strong>${did}</strong><span>Fez</span></div><div><strong>${due}</strong><span>Em dia</span></div><div><strong>${pend}</strong><span>Pendente</span></div></div><div class="demands">${open.map(x=>`<button data-open-item="${x.item.id}"><b>${esc(x.d.title||x.item.title)}</b><span>${fmt(x.d.due)}</span></button>`).join("")}</div></article>`;
  }).join("");
  el.querySelectorAll("[data-member]").forEach(b=>b.onclick=()=>openMember(b.dataset.member));
  el.querySelectorAll("[data-open-item]").forEach(b=>b.onclick=()=>{const item=state.payload.items.find(x=>x.id===b.dataset.openItem);if(item){const d=new Date(`${item.date}T12:00:00`);state.year=d.getFullYear();state.month=d.getMonth();state.page="calendar";render();openItem(item.id)}});
}
function renderTasks(){
  const el=document.querySelector("#tasks"); if(!el)return;
  const tasks=openTasks();
  el.innerHTML=`<div class="task-row header"><span>Tarefa</span><span>Responsável</span><span>Prazo</span><span>Prioridade</span><span>Status</span></div>`+
    (tasks.length?tasks.map(x=>`<div class="task-row"><button class="task-name" data-open-item="${x.item.id}"><b>${esc(x.delivery.title||x.item.title)}</b><small style="display:block;color:#7a877d">${esc(x.item.title)}</small></button><span>${esc(x.responsible?.name||"Sem responsável")}</span><span>${fmt(x.delivery.due)}</span><span class="${x.daysLate>0?"priority-late":x.daysLate===0?"priority-today":""}">${priorityLabel(x.daysLate)}</span><span class="status-pill">${esc(x.delivery.status)}</span></div>`).join(""):`<div style="padding:28px;text-align:center;color:#687469">Nenhuma tarefa em aberto.</div>`);
  el.querySelectorAll("[data-open-item]").forEach(b=>b.onclick=()=>{const item=state.payload.items.find(x=>x.id===b.dataset.openItem);if(item){const d=new Date(`${item.date}T12:00:00`);state.year=d.getFullYear();state.month=d.getMonth();state.page="calendar";render();openItem(item.id)}});
}
function renderResults(){
  const items=state.payload.items;
  const published=items.filter(i=>i.status==="Publicado"||i.done).length, approval=items.filter(i=>i.status==="Aprovação").length;
  const pending=items.reduce((n,i)=>n+(i.deliveries||[]).filter(d=>d.status==="Pendente").length,0), pct=items.length?Math.round(published/items.length*100):0;
  document.querySelector("#page").innerHTML=`
    <section class="hero"><div><p class="eyebrow">DO CONTEÚDO AO RESULTADO</p><h1>Resultados e direção<b>.</b></h1><small>Acompanhe a execução e use os dados para decidir o próximo movimento.</small></div></section>
    <section class="result-stats"><article><strong>${published}</strong><span>Publicadas</span></article><article><strong>${approval}</strong><span>Em aprovação</span></article><article><strong>${pending}</strong><span>Entregas pendentes</span></article><article><strong>${pct}%</strong><span>Conclusão</span></article></section>
    <section class="direction"><p class="eyebrow">NOSSA DIREÇÃO</p><h2>Mais clareza.<br>Mais execução.</h2><span>Mensagem, responsabilidade e leitura de resultado no mesmo sistema.</span></section>
    <section class="result-grid"><article><span>01</span><h3>Autoridade útil</h3><p>Transformar repertório estratégico em conteúdo aplicável.</p></article><article><span>02</span><h3>Operação visível</h3><p>Gargalos aparecem antes de virarem atraso.</p></article><article><span>03</span><h3>Decisão por dados</h3><p>Acompanhar o mês para ajustar pauta, formato e responsabilidade.</p></article></section>`;
}

function renderModal(){
  document.querySelector(".modal-backdrop")?.remove();
  if(!state.modal)return;
  const back=document.createElement("div");back.className="modal-backdrop";back.addEventListener("mousedown",e=>{if(e.target===back)closeModal()});
  if(state.modal.type==="holiday"){
    const date=state.modal.date, list=state.holidays[date]||[];
    back.innerHTML=`<div class="modal small"><div class="modal-head"><div><h2>Datas comemorativas</h2><p>${fmt(date)}</p></div><button class="close-btn">×</button></div><div class="holiday-list">${list.map(x=>`<div>${esc(x)}</div>`).join("")}</div></div>`;
  }else if(state.modal.type==="member"){
    const m=state.modal.value;
    back.innerHTML=`<div class="modal small"><div class="modal-head"><div><h2>${state.modal.exists?"Editar membro":"Novo membro"}</h2><p>Cadastre a pessoa e quantas funções forem necessárias.</p></div><button class="close-btn">×</button></div>
      <form class="form" id="member-form"><div class="field"><label>Nome</label><input name="name" value="${esc(m.name)}" required></div><div class="field"><label>Funções</label><div class="role-input-row"><input id="role-input" placeholder="Ex.: Social media, Copy, Estratégia"><button type="button" class="btn secondary sm" id="add-role">Adicionar</button></div><div class="role-editor-chips" id="role-chips"></div></div><div class="modal-footer">${state.modal.exists?`<button type="button" class="btn danger" id="delete-member">Excluir membro</button>`:""}<button type="button" class="btn secondary close-action">Cancelar</button><button class="btn" type="submit">Salvar membro</button></div></form></div>`;
  }else{
    const d=state.modal.value;
    back.innerHTML=`<div class="modal"><div class="modal-head"><div><h2>${state.payload.items.some(x=>x.id===d.id)?"Editar pauta":"Nova pauta"}</h2><p>Título, data, entregas e materiais visíveis para toda a equipe.</p></div><button class="close-btn">×</button></div>
      <form class="form" id="item-form">
        <div class="field"><label>Título da pauta</label><input name="title" value="${esc(d.title)}" placeholder="Ex.: Bastidores de uma decisão estratégica" required></div>
        <div class="grid2">
          <div class="field"><label>Data</label><input type="date" name="date" value="${esc(d.date)}" required></div>
          <div class="field"><label>Responsável</label><select name="owner"><option value="">Sem responsável</option>${state.payload.team.map(p=>`<option value="${p.id}" ${d.owner===p.id?"selected":""}>${esc(p.name)}</option>`).join("")}</select></div>
          <div class="field"><label>Formato</label><select name="format">${FORMATS.map(x=>`<option ${d.format===x?"selected":""}>${esc(x)}</option>`).join("")}</select></div>
          <div class="field"><label>Etapa</label><select name="status">${STATUS.map(x=>`<option ${d.status===x?"selected":""}>${esc(x)}</option>`).join("")}</select></div>
        </div>
        <div class="field"><label>Observações</label><textarea name="notes" placeholder="Contexto, copy, CTA, referências...">${esc(d.notes||"")}</textarea></div>
        <section class="panel"><div class="panel-head"><div><p>MATERIAL DE SUPORTE</p><h3>Links e referências.</h3></div><button type="button" class="btn secondary sm" id="add-support">＋ Adicionar link</button></div><div class="stack" id="support-stack"></div></section>
        <section class="panel"><div class="panel-head"><div><p>ENTREGAS DA EQUIPE</p><h3>Responsabilidades claras.</h3></div><button type="button" class="btn secondary sm" id="add-delivery">＋ Adicionar</button></div><div class="stack" id="delivery-stack"></div></section>
        <div id="save-error"></div><div class="modal-footer"><button type="button" class="btn secondary close-action">Cancelar</button><button class="btn" id="save-item" type="submit">Salvar pauta</button></div>
      </form></div>`;
  }
  document.body.append(back);
  back.querySelector(".close-btn")?.addEventListener("click",closeModal);
  back.querySelectorAll(".close-action").forEach(b=>b.addEventListener("click",closeModal));
  if(state.modal.type==="item")wireItemModal(back);
  if(state.modal.type==="member")wireMemberModal(back);
}
function wireItemModal(back){
  const draft=state.modal.value;
  const support=()=>{const el=back.querySelector("#support-stack");el.innerHTML=(draft.supportLinks||[]).length?(draft.supportLinks||[]).map((l,i)=>`<div class="support-row"><span>🔗 Link ${String(i+1).padStart(2,"0")}</span><input type="url" data-support="${l.id}" value="${esc(l.url)}" placeholder="https://..."><button type="button" data-remove-support="${l.id}">×</button></div>`).join(""):`<div class="empty-state">Nenhum material adicionado. Clique em <strong>Adicionar link</strong> para inserir quantos precisar.</div>`;
    el.querySelectorAll("[data-support]").forEach(inp=>inp.oninput=e=>{draft.supportLinks.find(x=>x.id===inp.dataset.support).url=e.target.value});
    el.querySelectorAll("[data-remove-support]").forEach(b=>b.onclick=()=>{draft.supportLinks=draft.supportLinks.filter(x=>x.id!==b.dataset.removeSupport);support()});
  };
  const deliveries=()=>{const el=back.querySelector("#delivery-stack");el.innerHTML=(draft.deliveries||[]).length?draft.deliveries.map((d,i)=>`<article class="delivery-card"><div class="delivery-card-head"><b>Tarefa ${String(i+1).padStart(2,"0")}</b><button type="button" data-remove-delivery="${d.id}">×</button></div><div class="field"><label>Nome da tarefa</label><input data-delivery="${d.id}" data-key="title" value="${esc(d.title||"")}" placeholder="Ex.: Editar Reels, criar copy, aprovar arte..."></div><div class="delivery-fields"><div class="field"><label>Responsável</label><select data-delivery="${d.id}" data-key="person"><option value="">Sem responsável</option>${state.payload.team.map(p=>`<option value="${p.id}" ${d.person===p.id?"selected":""}>${esc(p.name)}</option>`).join("")}</select></div><div class="field"><label>Prazo</label><input type="date" data-delivery="${d.id}" data-key="due" value="${esc(d.due||"")}"></div><div class="field"><label>Status</label><select data-delivery="${d.id}" data-key="status">${["Pendente","Em dia","Feito"].map(x=>`<option ${d.status===x?"selected":""}>${x}</option>`).join("")}</select></div></div></article>`).join(""):`<div class="empty-state">Nenhuma entrega adicionada.</div>`;
    el.querySelectorAll("[data-delivery]").forEach(inp=>inp.onchange=e=>{const d=draft.deliveries.find(x=>x.id===inp.dataset.delivery);d[inp.dataset.key]=e.target.value});
    el.querySelectorAll("[data-remove-delivery]").forEach(b=>b.onclick=()=>{draft.deliveries=draft.deliveries.filter(x=>x.id!==b.dataset.removeDelivery);deliveries()});
  };
  support();deliveries();
  back.querySelector("#add-support").onclick=()=>{draft.supportLinks=draft.supportLinks||[];draft.supportLinks.push({id:uuid(),url:""});support()};
  back.querySelector("#add-delivery").onclick=()=>{draft.deliveries=draft.deliveries||[];draft.deliveries.push({id:uuid(),title:draft.title||"Nova tarefa",person:draft.owner||state.payload.team[0]?.id||"",due:draft.date,status:"Pendente"});deliveries()};
  back.querySelector("#item-form").onsubmit=async e=>{
    e.preventDefault();
    const fd=new FormData(e.currentTarget);
    draft.title=String(fd.get("title")||"").trim(); draft.date=String(fd.get("date")||"");draft.owner=String(fd.get("owner")||"");draft.format=String(fd.get("format")||"");draft.status=String(fd.get("status")||"");draft.notes=String(fd.get("notes")||"");
    if(!draft.title)return;
    const btn=back.querySelector("#save-item");btn.disabled=true;btn.textContent="Salvando…";
    try{await applyAction({action:"upsertItem",item:draft});closeModal()}
    catch(err){back.querySelector("#save-error").innerHTML=`<div class="save-error">${esc(err.message||"Não foi possível salvar a pauta.")}</div>`;btn.disabled=false;btn.textContent="Salvar pauta"}
  };
}
function wireMemberModal(back){
  const draft=state.modal.value;
  const renderRoles=()=>{const el=back.querySelector("#role-chips");el.innerHTML=(draft.roles||[]).map(r=>`<span>${esc(r)} <button type="button" data-role="${esc(r)}">×</button></span>`).join("");el.querySelectorAll("[data-role]").forEach(b=>b.onclick=()=>{draft.roles=draft.roles.filter(r=>r!==b.dataset.role);renderRoles()})};
  renderRoles();
  back.querySelector("#add-role").onclick=()=>{const inp=back.querySelector("#role-input");const roles=inp.value.split(",").map(x=>x.trim()).filter(Boolean);draft.roles=[...new Set([...(draft.roles||[]),...roles])];inp.value="";renderRoles()};
  back.querySelector("#member-form").onsubmit=async e=>{e.preventDefault();draft.name=String(new FormData(e.currentTarget).get("name")||"").trim();if(!draft.name||!draft.roles.length)return;await applyAction({action:"upsertMember",member:draft});closeModal()};
  back.querySelector("#delete-member")?.addEventListener("click",async()=>{if(confirm("Excluir este membro? As tarefas continuam, mas ficam sem responsável.")){await applyAction({action:"deleteMember",id:draft.id});closeModal()}});
}

async function boot(){
  try{
    const [_,h]=await Promise.all([loadWorkspace(),fetch("./holidays.json").then(r=>r.json())]);
    state.holidays=h||{};
    shell();render();realtime();loadNews();setInterval(loadNews,5*60*1000);
  }catch(err){
    app.innerHTML=`<div class="loading-screen">Não foi possível carregar o calendário. ${esc(err.message||"")}</div>`;
  }
}
boot();
