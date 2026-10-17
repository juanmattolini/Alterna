(function(){
"use strict";
const DAYN=["Lun","Mar","Mié","Jue","Vie"];
const DAYL=["lunes","martes","miércoles","jueves","viernes"];
const MON=["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
const DEFAULT_CFG={officeDays:3,horizonWeeks:3,offAnchor:"allow",
  zones:[{id:"N",name:"Zona Norte",desks:16,off:""},{id:"S",name:"Zona Sur",desks:16,off:""},{id:"Q",name:"Sala silenciosa",desks:8,off:""}],
  teams:[]};
const EXAMPLE_TEAMS=[["Producto",12],["Tecnología",18],["Comercial",14],["Operaciones",10],["Finanzas",6],["Personas",4]];

const $=s=>document.querySelector(s);
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const pad=n=>String(n).padStart(2,"0");
const ymd=d=>d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate());
const parse=s=>{const[y,m,d]=s.split("-").map(Number);return new Date(y,m-1,d)};
const addDays=(d,n)=>{const x=new Date(d);x.setDate(x.getDate()+n);return x};
const monday=d=>{const x=new Date(d.getFullYear(),d.getMonth(),d.getDate());const w=(x.getDay()+6)%7;return addDays(x,-w)};
const todayStr=ymd(new Date());
const thisMon=monday(new Date());
const clone=o=>JSON.parse(JSON.stringify(o));
const uidGen=()=>(window.crypto&&crypto.randomUUID)?crypto.randomUUID():"10000000-1000-4000-8000-100000000000".replace(/[018]/g,c=>(c^Math.random()*16>>c/4).toString(16));

const S={cfg:clone(DEFAULT_CFG),bookings:new Map(),me:{id:null,name:"Tú",color:"#0f6b5c"},canEdit:true,canWrite:true,
  profile:{teamId:""},names:{},people:[],week:0,selDay:null,tab:"reservar",draft:null,busy:false};

/* ---------- desks ---------- */
function desksOf(cfg){const out=[];for(const z of cfg.zones){const off=new Set(String(z.off||"").split(/[ ,;]+/).filter(Boolean).map(Number));
  for(let i=1;i<=Math.max(0,+z.desks||0);i++)out.push({id:z.id+"-"+pad(i),zone:z.id,n:i,off:off.has(i)});}return out}
const activeDesks=()=>desksOf(S.cfg).filter(d=>!d.off);
const capacity=()=>activeDesks().length;

/* ---------- backend (Supabase) ---------- */
function sbStore(sb,uid){
  let ccb=null,bcb=null,range=null,cfgCache=null;
  const mapB=r=>({id:r.id,date:r.date,deskId:r.desk_id,userId:r.user_id});
  const fail=r=>{if(r.error)throw r.error;return r};
  async function loadCfg(){
    const [c,z,t]=await Promise.all([sb.from("office_config").select("*").eq("id",1).maybeSingle(),sb.from("zones").select("*").order("sort"),sb.from("teams").select("*").order("created_at")]);
    [c,z,t].forEach(fail);
    const cfg={officeDays:c.data?c.data.office_days:3,horizonWeeks:c.data?c.data.horizon_weeks:3,offAnchor:c.data?c.data.off_anchor:"allow",
      zones:z.data.map(r=>({id:r.id,name:r.name,desks:r.desks,off:(r.off_desks||[]).join(", ")})),
      teams:t.data.map(r=>({id:r.id,name:r.name,people:r.people,days:(r.days||[]).slice().sort()}))};
    cfgCache=cfg;ccb&&ccb(clone(cfg));}
  async function loadB(){if(!range)return;const r=await sb.from("bookings").select("id,date,desk_id,user_id").gte("date",range[0]).lte("date",range[1]);
    if(r.error){toast("No se pudieron cargar las reservas.");return}bcb&&bcb(r.data.map(mapB))}
  const deb=(f,ms)=>{let t;return()=>{clearTimeout(t);t=setTimeout(f,ms||250)}};
  const rb=deb(loadB),rc=deb(()=>loadCfg().catch(()=>{}));
  sb.channel("alterna-live")
    .on("postgres_changes",{event:"*",schema:"public",table:"bookings"},rb)
    .on("postgres_changes",{event:"*",schema:"public",table:"zones"},rc)
    .on("postgres_changes",{event:"*",schema:"public",table:"teams"},rc)
    .on("postgres_changes",{event:"*",schema:"public",table:"office_config"},rc)
    .subscribe();
  document.addEventListener("visibilitychange",()=>{if(!document.hidden){rb();rc()}});
  return{
    watchBookings(from,to,cb){bcb=cb;range=[from,to];loadB();return()=>{}},
    watchConfig(cb){ccb=cb;loadCfg().catch(()=>toast("No se pudo cargar la configuración de la oficina."))},
    async claim(date,deskId){const r=await sb.from("bookings").insert({date,desk_id:deskId});
      if(r.error){if(r.error.code==="23505"){rb();return false}throw r.error}rb();return true},
    async cancel(id){fail(await sb.from("bookings").delete().eq("id",id));rb()},
    async saveConfig(c){const prev=cfgCache||{zones:[],teams:[]};
      fail(await sb.from("office_config").update({office_days:c.officeDays,horizon_weeks:c.horizonWeeks,off_anchor:c.offAnchor,updated_at:new Date().toISOString()}).eq("id",1));
      const zrows=c.zones.map((z,i)=>({id:z.id,name:z.name,desks:z.desks,off_desks:String(z.off||"").split(/[ ,;]+/).filter(Boolean).map(Number).filter(n=>n>0),sort:i}));
      if(zrows.length)fail(await sb.from("zones").upsert(zrows));
      const zdel=prev.zones.map(z=>z.id).filter(id=>!c.zones.some(z=>z.id===id));if(zdel.length)fail(await sb.from("zones").delete().in("id",zdel));
      const trows=c.teams.map(t=>({id:t.id,name:t.name,people:t.people,days:t.days}));
      if(trows.length)fail(await sb.from("teams").upsert(trows));
      const tdel=prev.teams.map(t=>t.id).filter(id=>!c.teams.some(t=>t.id===id));if(tdel.length)fail(await sb.from("teams").delete().in("id",tdel));
      await loadCfg()},
    async loadProfile(){const r=await sb.from("profiles").select("team_id").eq("id",uid).maybeSingle();return{teamId:(r.data&&r.data.team_id)||""}},
    async saveProfile(p){fail(await sb.from("profiles").update({team_id:p.teamId||null}).eq("id",uid))},
    async loadPeople(){const r=await sb.from("profiles").select("id,full_name,role,team_id").order("full_name");fail(r);return r.data},
    async updatePerson(id,patch){fail(await sb.from("profiles").update(patch).eq("id",id))}
  };
}
let store=null,sb=null;


/* ---------- derived ---------- */
function rangeDays(){const out=[];for(let w=0;w<S.cfg.horizonWeeks;w++)for(let i=0;i<5;i++)out.push(ymd(addDays(thisMon,w*7+i)));return out}
function weekDays(w){return [0,1,2,3,4].map(i=>ymd(addDays(thisMon,w*7+i)))}
function bookingsOn(date){const r=[];for(const b of S.bookings.values())if(b.date===date)r.push(b);return r}
function myBookings(){return[...S.bookings.values()].filter(b=>b.userId===S.me.id).sort((a,b)=>a.date.localeCompare(b.date))}
function myOn(date){return myBookings().find(b=>b.date===date)}
function myTeam(){return S.cfg.teams.find(t=>t.id===S.profile.teamId)}
function anchorIdx(){const t=myTeam();return t?t.days:[]}
function fmtDay(s){const d=parse(s);return DAYL[(d.getDay()+6)%7]+" "+d.getDate()+" "+MON[d.getMonth()]}
function initials(n){return String(n||"?").trim().split(/\s+/).slice(0,2).map(p=>p[0]||"").join("").toUpperCase()||"?"}
function nameOf(id){if(id===S.me.id)return S.me.name||"Tú";return S.names[id]||"Colega"}

/* ---------- ui helpers ---------- */
const ic=(n,c)=>'<svg class="ic'+(c?" "+c:"")+'" aria-hidden="true"><use href="#i-'+n+'"/></svg>';
function avatar(id,name,size){return '<span class="avatar'+(size?" "+size:"")+'" style="background:'+colorFor(id)+'" aria-hidden="true">'+esc(initials(name))+'</span>'}
const DESK_ILLUS='<svg class="illus" viewBox="0 0 220 110" aria-hidden="true"><rect class="as" x="0" y="96" width="220" height="6" rx="3"/><rect class="a" x="40" y="44" width="110" height="10" rx="3"/><rect class="a" x="50" y="54" width="6" height="42"/><rect class="a" x="134" y="54" width="6" height="42"/><rect class="l" x="74" y="18" width="42" height="26" rx="3"/><rect class="s" x="78" y="22" width="34" height="18" rx="2"/><rect class="t" x="120" y="34" width="14" height="10" rx="2"/><path class="k" d="M166 96V70h22v26M170 70V52a7 7 0 0 1 14 0v18"/><circle class="t" cx="30" cy="34" r="10"/><path class="k" d="M30 44v52M22 60l8 6 8-10"/></svg>';
/* theme: system → light → dark */
const THEMES=["system","light","dark"],THEME_ICON={system:"monitor",light:"sun",dark:"moon"},THEME_LABEL={system:"Tema del sistema",light:"Tema claro",dark:"Tema oscuro"};
function getTheme(){try{return localStorage.getItem("alterna:theme")||"system"}catch(e){return "system"}}
function applyTheme(t){const el=document.documentElement;t==="system"?el.removeAttribute("data-theme"):el.setAttribute("data-theme",t);
  try{localStorage.setItem("alterna:theme",t)}catch(e){}
  document.querySelectorAll("[data-theme-toggle]").forEach(b=>{b.innerHTML=ic(THEME_ICON[t]);b.title=THEME_LABEL[t]+" (tocá para cambiar)";b.setAttribute("aria-label",THEME_LABEL[t]+". Cambiar tema")})}
document.querySelectorAll("[data-theme-toggle]").forEach(b=>b.addEventListener("click",()=>{const t=getTheme();const n=THEMES[(THEMES.indexOf(t)+1)%3];applyTheme(n);toast(THEME_LABEL[n]+".")}));
applyTheme(getTheme());
let tt;function toast(m){const t=$("#toast");t.textContent=m;t.hidden=false;clearTimeout(tt);tt=setTimeout(()=>t.hidden=true,3200)}
function sheet(html,bind){const h=$("#sheetHost");h.innerHTML='<div class="scrim" id="scrim"><div class="sheet" role="dialog" aria-modal="true">'+html+'</div></div>';
  const close=()=>h.innerHTML="";$("#scrim").addEventListener("click",e=>{if(e.target.id==="scrim")close()});
  h.querySelectorAll("[data-close]").forEach(b=>b.addEventListener("click",close));bind&&bind(close);const f=h.querySelector("button");f&&f.focus()}

/* ---------- render: header ---------- */
function renderMe(){$("#meInfo").innerHTML=avatar(S.me.id,S.me.name)+'<span style="min-width:0"><b>'+esc(S.me.name||"Tú")+'</b><br>'+esc(myTeam()?myTeam().name:"Sin equipo")+'</span>'}

/* ---------- render: reservar ---------- */
function renderQuota(){const days=weekDays(S.week);const mine=days.filter(d=>myOn(d)).length;const q=S.cfg.officeDays;
  let pips="";for(let i=0;i<Math.max(q,mine);i++)pips+='<i class="pip '+(i<mine?(i>=q?"over":"on"):"")+'"></i>';
  const left=q-mine;const msg=left>0?"Te faltan "+left+" "+(left===1?"día":"días")+" de oficina esta semana.":left===0?"Cumpliste tus "+q+" días presenciales de esta semana.":"Reservaste más días que el esquema "+q+"+"+(5-q)+".";
  $("#quota").innerHTML='<div><span class="sub">Semana '+(S.week===0?"actual":"del "+fmtDay(days[0]).replace(/^\S+ /,""))+'</span><br><strong class="num">'+mine+' de '+q+'</strong> <span class="sub">días presenciales</span></div><div class="pips" aria-hidden="true">'+pips+'</div><p class="sub" style="flex:1;min-width:200px">'+esc(msg)+'</p>'}
function renderDays(){const days=weekDays(S.week);const cap=capacity();const anc=anchorIdx();
  $("#weekLabel").textContent=fmtDay(days[0]).replace(/^\S+ /,"")+" al "+fmtDay(days[4]).replace(/^\S+ /,"");
  $("#prevW").disabled=S.week<=0;$("#nextW").disabled=S.week>=S.cfg.horizonWeeks-1;
  if(!S.selDay||!days.includes(S.selDay))S.selDay=days.find(d=>d>=todayStr)||days[0];
  $("#days").innerHTML=days.map((d,i)=>{const n=bookingsOn(d).length;const pct=cap?Math.min(100,n/cap*100):0;const dt=parse(d);
    return '<button class="day'+(d<todayStr?" past":"")+'" data-day="'+d+'" aria-pressed="'+(d===S.selDay)+'"><span class="dname">'+DAYN[i]+'</span><span class="dnum">'+dt.getDate()+'</span><span class="free num">'+Math.max(0,cap-n)+' libres</span><span class="bar"><i class="'+(pct>=85?"hot":"")+'" style="width:'+pct+'%"></i></span>'+(myOn(d)?'<span class="mine">'+esc(myOn(d).deskId)+'</span>':"")+(anc.includes(i)?'<span class="anchor" title="Día ancla de tu equipo"></span>':"")+'</button>'}).join("");
  $("#days").querySelectorAll(".day").forEach(b=>b.addEventListener("click",()=>{S.selDay=b.dataset.day;renderReservar()}));
  const need=anc.length>0&&days.some((d,i)=>anc.includes(i)&&d>=todayStr&&!myOn(d));
  $("#autoBtn").disabled=!S.canWrite||!need;$("#autoBtn").title=anc.length?"":"Elegí tu equipo en Mis reservas para tener días ancla";}
function renderZones(){const d=S.selDay;const taken=new Map(bookingsOn(d).map(b=>[b.deskId,b]));const past=d<todayStr;const mine=myOn(d);
  const di=(parse(d).getDay()+6)%7;const anc=anchorIdx();
  $("#planTitle").textContent="Plano del "+fmtDay(d);
  $("#planSub").textContent=past?"Este día ya pasó.":mine?"Tenés el puesto "+mine.deskId+". Tocalo para liberarlo.":(anc.length&&!anc.includes(di)?"No es un día ancla de tu equipo. ":"")+"Elegí un puesto libre para reservarlo.";
  const all=desksOf(S.cfg);
  $("#zones").innerHTML=S.cfg.zones.map(z=>{const ds=all.filter(x=>x.zone===z.id);const free=ds.filter(x=>!x.off&&!taken.has(x.id)).length;
    return '<div class="zone"><h3>'+esc(z.name)+'<span class="num">'+free+' de '+ds.filter(x=>!x.off).length+' libres</span></h3><div class="desks">'+ds.map(x=>{
      if(x.off)return '<div class="desk off" title="Fuera de servicio"><span class="code">'+x.id+'</span></div>';
      const b=taken.get(x.id);
      if(b&&b.userId===S.me.id)return '<button class="desk mine" data-desk="'+x.id+'" aria-label="'+x.id+', tu puesto"><span class="code">'+x.id+'</span><span class="who">'+ic("check")+'Tú</span></button>';
      if(b)return '<div class="desk taken" title="'+esc(nameOf(b.userId))+'"><span class="code">'+x.id+'</span><span class="who">'+avatar(b.userId,nameOf(b.userId),"sm")+esc(nameOf(b.userId).split(" ")[0])+'</span></div>';
      return '<button class="desk free" data-desk="'+x.id+'"'+(past||!S.canWrite?" disabled":"")+ ' aria-label="'+x.id+', libre">'+ic("armchair")+'<span class="code">'+x.id+'</span></button>'}).join("")+'</div></div>'}).join("");
  $("#zones").querySelectorAll("button.desk").forEach(b=>b.addEventListener("click",()=>deskClick(b.dataset.desk)));}
function renderReservar(){renderQuota();renderDays();renderZones()}

function weekCount(date){const m=monday(parse(date));const ds=[0,1,2,3,4].map(i=>ymd(addDays(m,i)));return ds.filter(d=>myOn(d)).length}
function deskClick(deskId){const d=S.selDay;const mine=myOn(d);
  if(mine&&mine.deskId===deskId){sheet('<h3>Liberar '+esc(deskId)+'</h3><p class="sub">El puesto del '+esc(fmtDay(d))+' queda libre para otra persona.</p><div class="row"><span class="spacer"></span><button class="btn ghost" data-close>Volver</button><button class="btn danger" id="okC">Liberar puesto</button></div>',
    close=>$("#okC").addEventListener("click",async()=>{close();await doCancel(mine.id)}));return}
  const di=(parse(d).getDay()+6)%7;const anc=anchorIdx();const offA=anc.length&&!anc.includes(di);
  if(offA&&S.cfg.offAnchor==="block"){toast("Tu oficina solo permite reservar en los días ancla de tu equipo.");return}
  const wc=weekCount(d)-(mine?1:0);const q=S.cfg.officeDays;let warn="";
  if(wc>=q)warn+='<p class="banner">Ya tenés '+wc+' días esta semana. El esquema es de '+q+' días presenciales; un día extra le quita lugar a otra persona.</p>';
  if(offA)warn+='<p class="banner">El '+DAYL[di]+' no es día ancla de '+esc(myTeam().name)+'. Podés reservar porque hay lugar.</p>';
  sheet('<h3>Reservar '+esc(deskId)+'</h3><p class="sub">'+esc(fmtDay(d))+(mine?". Reemplaza tu reserva en "+esc(mine.deskId)+".":"")+'</p>'+warn+'<div class="row"><span class="spacer"></span><button class="btn ghost" data-close>Cancelar</button><button class="btn primary" id="okR">Confirmar reserva</button></div>',
    close=>$("#okR").addEventListener("click",async()=>{close();await doClaim(d,deskId,mine)}));}
async function doClaim(d,deskId,replace){if(S.busy)return;S.busy=true;
  try{if(replace)await store.cancel(replace.id);
    const ok=await store.claim(d,deskId,S.me.id);
    if(!ok){if(replace)await store.claim(d,replace.deskId,S.me.id).catch(()=>{});toast(deskId+" se acaba de ocupar. Elegí otro puesto.");return}
    toast("Reservaste "+deskId+" para el "+fmtDay(d)+".")}
  catch(e){toast(e&&e.message&&/Fuera del período|día pasado|lunes a viernes/.test(e.message)?e.message+".":"No se pudo guardar la reserva. Probá de nuevo.")}
  finally{S.busy=false}}
async function doCancel(id){try{await store.cancel(id);toast("Puesto liberado.")}catch(e){toast("No se pudo liberar el puesto. Probá de nuevo.")}}

/* Auto-book: same desk on every anchor day when possible, else nearest in same zone */
async function autoBook(){const days=weekDays(S.week);const anc=anchorIdx();const targets=days.filter((d,i)=>anc.includes(i)&&d>=todayStr&&!myOn(d));
  if(!targets.length)return;const act=activeDesks();
  const prev=myBookings().map(b=>b.deskId);const score={};prev.forEach(x=>score[x]=(score[x]||0)+1);
  const freeOn=d=>{const t=new Set(bookingsOn(d).map(b=>b.deskId));return act.filter(x=>!t.has(x.id))};
  const common=act.filter(x=>targets.every(d=>freeOn(d).some(f=>f.id===x.id))).sort((a,b)=>(score[b.id]||0)-(score[a.id]||0));
  let done=[],fail=[];
  for(const d of targets){if(weekCount(d)>=S.cfg.officeDays)break;
    let pick=common[0];if(!pick||!freeOn(d).some(f=>f.id===pick.id)){const f=freeOn(d);const z=common[0]?common[0].zone:(prev[0]||"").split("-")[0];pick=f.find(x=>x.zone===z)||f[0]}
    if(!pick){fail.push(d);continue}
    try{const ok=await store.claim(d,pick.id,S.me.id);ok?done.push(DAYN[(parse(d).getDay()+6)%7]+" "+pick.id):fail.push(d)}catch(e){fail.push(d)}}
  toast(done.length?"Reservado: "+done.join(", ")+(fail.length?". Sin lugar en "+fail.length+" día(s).":"."):"No había puestos libres en tus días ancla.")}

/* ---------- render: mis reservas ---------- */
function renderMias(){const list=myBookings().filter(b=>b.date>=todayStr);
  $("#myList").innerHTML=list.length?list.map(b=>{const z=S.cfg.zones.find(z=>z.id===b.deskId.split("-")[0]);
    return '<div class="item"><span class="tag">'+esc(b.deskId)+'</span><div class="grow"><b>'+esc(fmtDay(b.date))+'</b><span class="sub">'+esc(z?z.name:"")+(b.date===todayStr?" · hoy":"")+'</span></div><button class="btn danger" data-cancel="'+esc(b.id)+'">Liberar</button></div>'}).join("")
    :'<div class="empty">'+DESK_ILLUS+'Todavía no tenés reservas. Andá a Reservar y elegí un puesto, o usá “Reservar mis días de equipo”.</div>';
  $("#myList").querySelectorAll("[data-cancel]").forEach(b=>b.addEventListener("click",()=>doCancel(b.dataset.cancel)));
  const sel=$("#myTeam");sel.innerHTML='<option value="">Sin equipo</option>'+S.cfg.teams.map(t=>'<option value="'+esc(t.id)+'">'+esc(t.name)+' ('+t.days.map(i=>DAYN[i]).join(", ")+')</option>').join("");
  sel.value=myTeam()?S.profile.teamId:"";
  if(document.activeElement!==$("#myName"))$("#myName").value=S.me.name||"";}

/* ---------- render: ocupación ---------- */
function bars(rows,cap,el){const max=Math.max(cap,...rows.map(r=>r.v),1);
  el.innerHTML=rows.map(r=>'<div class="crow"><span>'+esc(r.label)+'</span><div class="track"><div class="fill'+(r.v>cap?" over":"")+'" style="width:'+(r.v/max*100)+'%"></div><i class="cap" style="left:calc('+(cap/max*100)+'% - 1px)"></i></div><span class="val">'+r.v+' / '+cap+'</span></div>').join("")}
function renderOcupacion(){const cap=capacity();const days=rangeDays();const wk=weekDays(0);
  const counts=days.map(d=>({d,v:bookingsOn(d).length}));const wkc=counts.filter(c=>wk.includes(c.d));
  const avg=cap?Math.round(wkc.reduce((s,c)=>s+c.v,0)/(5*cap)*100):0;const peak=wkc.reduce((a,c)=>c.v>a.v?c:a,{v:-1,d:wk[0]});
  const upcoming=counts.filter(c=>c.d>=todayStr).reduce((s,c)=>s+c.v,0);
  $("#occTiles").innerHTML=[["Puestos activos",cap,S.cfg.zones.length+" zonas"],["Ocupación semana actual",avg+"%","promedio de lunes a viernes"],["Día más cargado",peak.v<0?"–":DAYN[(parse(peak.d).getDay()+6)%7]+" "+parse(peak.d).getDate(),peak.v<0?"":peak.v+" reservas"],["Reservas próximas",upcoming,"en las próximas "+S.cfg.horizonWeeks+" semanas"]]
    .map(t=>'<div class="tile"><div class="k">'+t[0]+'</div><div class="v">'+esc(t[1])+'</div><div class="h">'+esc(t[2])+'</div></div>').join("");
  bars(counts.map(c=>({label:DAYN[(parse(c.d).getDay()+6)%7]+" "+parse(c.d).getDate()+"/"+(parse(c.d).getMonth()+1),v:c.v})),cap,$("#occChart"));}

/* ---------- optimizer ---------- */
const COMBOS=(k=>{const out=[];const rec=(s,a)=>{if(a.length===k){out.push(a);return}for(let i=s;i<5;i++)rec(i+1,a.concat(i))};rec(0,[]);return out});
function loadOf(teams){const l=[0,0,0,0,0];teams.forEach(t=>t.days.forEach(i=>l[i]+=(+t.people||0)));return l}
function optimize(teams,k){const opts=COMBOS(k);const T=teams.map(t=>({...t,days:t.days.length===k?t.days.slice():opts[0]}));
  const cost=l=>{const m=Math.max(...l);return m*1e6+l.reduce((s,x)=>s+x*x,0)};
  // greedy, largest teams first
  const order=T.map((t,i)=>i).sort((a,b)=>(+T[b].people||0)-(+T[a].people||0));const l=[0,0,0,0,0];
  for(const i of order){let best=null,bc=Infinity;for(const o of opts){const nl=l.slice();o.forEach(d=>nl[d]+=(+T[i].people||0));const c=cost(nl);if(c<bc){bc=c;best=o}}T[i].days=best.slice();best.forEach(d=>l[d]+=(+T[i].people||0))}
  // local improvement
  for(let pass=0,improved=true;pass<50&&improved;pass++){improved=false;for(let i=0;i<T.length;i++){const base=cost(loadOf(T));for(const o of opts){const keep=T[i].days;T[i].days=o;if(cost(loadOf(T))<base-1e-9){improved=true;break}T[i].days=keep}}}
  return T}

/* ---------- render: equipos ---------- */
function renderPlan(){const cap=capacity();const k=S.cfg.officeDays;const teams=S.draft||S.cfg.teams;const total=teams.reduce((s,t)=>s+(+t.people||0),0);
  const load=loadOf(teams);const peak=Math.max(0,...load);const ideal=Math.ceil(total*k/5);const support=Math.floor(cap*5/k);
  $("#planTiles").innerHTML=[["Personas en equipos",total,teams.length+" equipos"],["Pico planificado",peak,"personas el día más cargado"],["Mínimo teórico",ideal,"puestos con carga perfectamente pareja"],["Capacidad del esquema",support,"personas que entran con "+cap+" puestos y "+k+"+"+(5-k)]]
    .map((t,i)=>'<div class="tile"><div class="k">'+t[0]+'</div><div class="v"'+(i===1&&peak>cap?' style="color:var(--warn)"':"")+'>'+t[1]+'</div><div class="h">'+esc(t[2])+'</div></div>').join("");
  const ed=S.canEdit;
  if(!teams.length){$("#teamsBox").innerHTML='<div class="empty">'+DESK_ILLUS+'<span>Todavía no hay equipos. Agregá tus equipos con su cantidad de personas, o '+(ed?'<button class="btn" id="loadEx">cargá un ejemplo</button> para probar el optimizador':"pedile a quien administra la oficina que los cargue")+'.</span></div>';
    const b=$("#loadEx");b&&b.addEventListener("click",()=>{S.draft=EXAMPLE_TEAMS.map(([n,p],i)=>({id:uidGen(),name:n+" (ejemplo)",people:p,days:COMBOS(k)[i%10].slice()}));renderPlan()})}
  else{$("#teamsBox").innerHTML='<div class="tablewrap"><table><thead><tr><th>Equipo</th><th>Personas</th><th>Días ancla</th><th></th></tr></thead><tbody>'+teams.map((t,ti)=>'<tr data-i="'+ti+'"><td>'+(ed?'<input type="text" id="tn-'+esc(t.id)+'" data-f="name" value="'+esc(t.name)+'" aria-label="Nombre del equipo">':esc(t.name))+'</td><td>'+(ed?'<input type="number" min="0" id="tp-'+esc(t.id)+'" data-f="people" value="'+(+t.people||0)+'" aria-label="Personas">':'<span class="num">'+t.people+'</span>')+'</td><td><div class="dchips">'+DAYN.map((dn,i)=>'<button class="dchip'+(t.days.includes(i)?" on":"")+'" data-d="'+i+'"'+(ed?"":" disabled")+' aria-pressed="'+t.days.includes(i)+'" aria-label="'+DAYL[i]+'">'+dn[0]+'</button>').join("")+'</div></td><td>'+(ed?'<button class="btn ghost danger" data-del aria-label="Quitar equipo">'+ic("trash-2")+'<span class="hide-sm">Quitar</span></button>':"")+'</td></tr>').join("")+'</tbody></table></div>'+(S.draft?'<div class="row" style="margin-top:12px"><span class="sub">Tenés cambios sin guardar.</span><span class="spacer"></span><button class="btn ghost" id="discard">Descartar</button><button class="btn primary" id="saveTeams">Guardar equipos</button></div>':"");
    const box=$("#teamsBox");const ensure=()=>{if(!S.draft)S.draft=clone(S.cfg.teams);return S.draft};
    box.querySelectorAll("input[data-f]").forEach(inp=>inp.addEventListener("change",()=>{const i=+inp.closest("tr").dataset.i;const dr=ensure();dr[i][inp.dataset.f]=inp.dataset.f==="people"?Math.max(0,+inp.value||0):inp.value.trim()||"Equipo";renderPlan()}));
    box.querySelectorAll(".dchip").forEach(b=>b.addEventListener("click",()=>{const i=+b.closest("tr").dataset.i;const dr=ensure();const d=+b.dataset.d;const s=new Set(dr[i].days);
      if(s.has(d))s.delete(d);else{if(s.size>=k){toast("Cada equipo tiene "+k+" días ancla. Quitá uno antes de sumar otro.");return}s.add(d)}dr[i].days=[...s].sort();renderPlan()}));
    box.querySelectorAll("[data-del]").forEach(b=>b.addEventListener("click",()=>{const i=+b.closest("tr").dataset.i;ensure().splice(i,1);renderPlan()}));
    const sv=$("#saveTeams");sv&&sv.addEventListener("click",async()=>{const bad=S.draft.find(t=>t.days.length!==k);if(bad){toast(bad.name+" necesita "+k+" días ancla.");return}
      const dr=S.draft;S.draft=null;try{await store.saveConfig({...S.cfg,teams:dr});toast("Equipos guardados.")}catch(e){S.draft=dr;toast("No se pudieron guardar los equipos.")}renderPlan()});
    const dc=$("#discard");dc&&dc.addEventListener("click",()=>{S.draft=null;renderPlan()});}
  $("#addTeam").hidden=!ed;$("#optimize").hidden=!ed;$("#optimize").disabled=!teams.length;
  bars(DAYN.map((d,i)=>({label:DAYL[i][0].toUpperCase()+DAYL[i].slice(1),v:load[i]})),cap,$("#planChart"));}

/* ---------- render: config ---------- */
let cfgDraft=null;
function renderConfig(){cfgDraft=cfgDraft||clone(S.cfg);const ed=S.canEdit;
  $("#cfgDays").value=cfgDraft.officeDays;$("#cfgHorizon").value=cfgDraft.horizonWeeks;$("#cfgOffAnchor").value=cfgDraft.offAnchor||"allow";
  ["#cfgDays","#cfgHorizon","#cfgOffAnchor","#addZone","#saveCfg"].forEach(s=>$(s).disabled=!ed);
  $("#zoneRows").innerHTML=cfgDraft.zones.map((z,i)=>'<tr data-i="'+i+'"><td><input type="text" id="zc-'+i+'" data-f="id" value="'+esc(z.id)+'" maxlength="3" style="width:64px" aria-label="Código"'+(ed?"":" disabled")+'></td><td><input type="text" id="zn-'+i+'" data-f="name" value="'+esc(z.name)+'" aria-label="Nombre"'+(ed?"":" disabled")+'></td><td><input type="number" id="zd-'+i+'" data-f="desks" min="0" max="200" value="'+z.desks+'" aria-label="Puestos"'+(ed?"":" disabled")+'></td><td><input type="text" id="zo-'+i+'" data-f="off" value="'+esc(z.off||"")+'" placeholder="ej. 3, 7" aria-label="Puestos fuera de servicio"'+(ed?"":" disabled")+'></td><td>'+(ed?'<button class="btn ghost danger" data-del aria-label="Quitar zona">'+ic("trash-2")+'<span class="hide-sm">Quitar</span></button>':"")+'</td></tr>').join("");
  $("#zoneRows").querySelectorAll("input").forEach(inp=>inp.addEventListener("change",()=>{const z=cfgDraft.zones[+inp.closest("tr").dataset.i];const f=inp.dataset.f;
    z[f]=f==="desks"?Math.max(0,Math.min(200,+inp.value||0)):f==="id"?(inp.value.toUpperCase().replace(/[^A-Z0-9]/g,"")||"Z"):inp.value}));
  $("#zoneRows").querySelectorAll("[data-del]").forEach(b=>b.addEventListener("click",()=>{cfgDraft.zones.splice(+b.closest("tr").dataset.i,1);renderConfig()}));
  renderPeople();
  $("#cfgNote").textContent=ed?"Total: "+desksOf(cfgDraft).filter(d=>!d.off).length+" puestos activos. Las reservas existentes se mantienen aunque cambies las zonas.":"Solo quien administra la oficina puede cambiar esta configuración.";}

function renderPeople(){const box=$("#peoplePanel");box.hidden=!S.canEdit;if(!S.canEdit)return;
  const admins=S.people.filter(p=>p.role==="admin").length;
  $("#peopleRows").innerHTML=S.people.map(p=>{const t=S.cfg.teams.find(t=>t.id===p.team_id);const lastAdmin=p.role==="admin"&&admins<=1;
    return '<tr><td><span class="person">'+avatar(p.id,p.full_name)+'<span>'+esc(p.full_name||"Sin nombre")+(p.id===S.me.id?' <span class="sub">(vos)</span>':"")+'</span></span></td><td>'+esc(t?t.name:"Sin equipo")+'</td><td><select id="role-'+esc(p.id)+'" data-person="'+esc(p.id)+'" aria-label="Rol"'+(lastAdmin?' disabled title="Tiene que quedar al menos un administrador"':"")+'><option value="member"'+(p.role==="member"?" selected":"")+'>Colaborador</option><option value="admin"'+(p.role==="admin"?" selected":"")+'>Administrador</option></select></td></tr>'}).join("")||'<tr><td colspan="3" class="sub">Todavía no hay personas registradas.</td></tr>';
  $("#peopleRows").querySelectorAll("select[data-person]").forEach(sel=>sel.addEventListener("change",async()=>{
    try{await store.updatePerson(sel.dataset.person,{role:sel.value});toast("Rol actualizado.")}catch(e){toast("No se pudo cambiar el rol.")}
    await loadPeople();render()}));}

/* ---------- routing ---------- */
function render(){renderMe();
  ({reservar:renderReservar,mias:renderMias,ocupacion:renderOcupacion,plan:renderPlan,config:renderConfig})[S.tab]();}
function setTab(t){S.tab=t;document.querySelectorAll("#tabs button").forEach(b=>b.setAttribute("aria-selected",b.dataset.tab===t));
  document.querySelectorAll("section.view").forEach(s=>s.hidden=s.id!=="v-"+t);try{localStorage.setItem("alterna:tab",t)}catch(e){}render();window.scrollTo(0,0)}
document.querySelectorAll("#tabs button").forEach(b=>b.addEventListener("click",()=>setTab(b.dataset.tab)));
$("#prevW").addEventListener("click",()=>{if(S.week>0){S.week--;S.selDay=null;renderReservar()}});
$("#nextW").addEventListener("click",()=>{if(S.week<S.cfg.horizonWeeks-1){S.week++;S.selDay=null;renderReservar()}});
$("#autoBtn").addEventListener("click",autoBook);
$("#myTeam").addEventListener("change",async e=>{S.profile={...S.profile,teamId:e.target.value};try{await store.saveProfile(S.profile);await loadPeople()}catch(x){toast("No se pudo guardar tu equipo.")}render()});
$("#myName").addEventListener("change",async e=>{const n=e.target.value.trim();if(!n)return;
  try{await store.updatePerson(S.me.id,{full_name:n});S.me.name=n;S.names[S.me.id]=n;toast("Nombre actualizado.");render()}catch(x){toast("No se pudo guardar tu nombre.")}});
$("#addTeam").addEventListener("click",()=>{S.draft=S.draft||clone(S.cfg.teams);S.draft.push({id:uidGen(),name:"Nuevo equipo",people:5,days:COMBOS(S.cfg.officeDays)[0].slice()});renderPlan()});
$("#optimize").addEventListener("click",()=>{const src=S.draft||S.cfg.teams;const before=Math.max(0,...loadOf(src));S.draft=optimize(clone(src),S.cfg.officeDays);const after=Math.max(0,...loadOf(S.draft));
  renderPlan();toast(after<before?"El pico baja de "+before+" a "+after+" personas. Revisá y guardá.":"La distribución ya era óptima ("+after+" personas en el pico).")});
["#cfgDays","#cfgHorizon","#cfgOffAnchor"].forEach(s=>$(s).addEventListener("change",()=>{cfgDraft.officeDays=Math.max(1,Math.min(5,+$("#cfgDays").value||3));cfgDraft.horizonWeeks=Math.max(1,Math.min(8,+$("#cfgHorizon").value||3));cfgDraft.offAnchor=$("#cfgOffAnchor").value;renderConfig()}));
$("#addZone").addEventListener("click",()=>{cfgDraft.zones.push({id:"Z"+(cfgDraft.zones.length+1),name:"Nueva zona",desks:8,off:""});renderConfig()});
$("#saveCfg").addEventListener("click",async()=>{const ids=cfgDraft.zones.map(z=>z.id);if(new Set(ids).size!==ids.length){toast("Cada zona necesita un código distinto.");return}
  const c={...cfgDraft};if(c.officeDays!==S.cfg.officeDays)c.teams=S.cfg.teams.map(t=>({...t,days:t.days.slice(0,c.officeDays).concat(COMBOS(c.officeDays)[0].filter(d=>!t.days.includes(d))).slice(0,c.officeDays).sort()}));else c.teams=S.cfg.teams;
  try{cfgDraft=null;await store.saveConfig(c);toast("Configuración guardada.");render()}catch(e){toast("No se pudo guardar la configuración.")}});

/* ---------- data wiring ---------- */
let watchedTo=null,unwatch=null;
function startWatch(){const days=rangeDays();const to=days[days.length-1];if(watchedTo&&to<=watchedTo)return;watchedTo=to;
  if(unwatch)unwatch();unwatch=store.watchBookings(ymd(thisMon),to,list=>{S.bookings=new Map(list.map(b=>[b.id,b]));resolveNames();render()})}
async function loadPeople(){try{S.people=await store.loadPeople();S.names={};S.people.forEach(p=>S.names[p.id]=p.full_name||"Colega");
  const me=S.people.find(p=>p.id===S.me.id);if(me){S.me.name=me.full_name||S.me.name;S.canEdit=me.role==="admin"}}catch(e){}}
let namesPending=false;
async function resolveNames(){if(namesPending)return;const miss=[...S.bookings.values()].some(b=>b.userId&&!(b.userId in S.names));
  if(!miss)return;namesPending=true;await loadPeople();namesPending=false;render()}
function onConfig(c){S.cfg={...clone(DEFAULT_CFG),...(c||{})};if(!Array.isArray(S.cfg.teams))S.cfg.teams=[];if(S.week>S.cfg.horizonWeeks-1)S.week=Math.min(S.week,S.cfg.horizonWeeks-1);startWatch();render()}
function colorFor(id){let h=0;for(const ch of String(id))h=(h*31+ch.charCodeAt(0))%360;return "hsl("+h+" 45% 38%)"}

/* ---------- auth ---------- */
const AUTH_MSG={"Invalid login credentials":"El correo o la contraseña no son correctos.","Email not confirmed":"Todavía no confirmaste tu correo. Revisá tu bandeja de entrada.","User already registered":"Ya existe una cuenta con ese correo. Ingresá o recuperá tu contraseña."};
const authErr=e=>AUTH_MSG[e&&e.message]||(e&&/password/i.test(e.message)?"La contraseña tiene que tener al menos 6 caracteres.":(e&&/rate limit/i.test(e.message)?"Se enviaron demasiados correos. Esperá unos minutos y probá de nuevo.":"No se pudo completar. Revisá los datos y probá de nuevo."));
let recovering=false;
function showAuth(mode){document.body.classList.add("signed-out");$("#auth").hidden=false;
  document.querySelectorAll("#auth form").forEach(f=>f.hidden=f.dataset.mode!==mode);$("#authMsg").textContent="";$("#authMsg").className="auth-msg";
  const f=document.querySelector('#auth form[data-mode="'+mode+'"] input');f&&f.focus()}
function hideAuth(){document.body.classList.remove("signed-out");$("#auth").hidden=true}
function authNote(m,ok){const el=$("#authMsg");el.textContent=m;el.className="auth-msg"+(ok?" ok":" err")}
const redirectTo=()=>location.origin+location.pathname;
document.querySelectorAll("[data-goto]").forEach(a=>a.addEventListener("click",e=>{e.preventDefault();showAuth(a.dataset.goto)}));
async function busyForm(form,fn){const b=form.querySelector("button[type=submit]");b.disabled=true;try{await fn()}finally{b.disabled=false}}
$("#fLogin").addEventListener("submit",e=>{e.preventDefault();busyForm(e.target,async()=>{
  const {error}=await sb.auth.signInWithPassword({email:$("#liEmail").value.trim(),password:$("#liPass").value});if(error)authNote(authErr(error))})});
$("#fSignup").addEventListener("submit",e=>{e.preventDefault();busyForm(e.target,async()=>{
  const {data,error}=await sb.auth.signUp({email:$("#suEmail").value.trim(),password:$("#suPass").value,options:{data:{full_name:$("#suName").value.trim()},emailRedirectTo:redirectTo()}});
  if(error){authNote(authErr(error));return}
  if(!data.session)authNote("Te enviamos un correo a "+$("#suEmail").value.trim()+". Abrí el enlace para confirmar tu cuenta y después ingresá.",true)})});
$("#fReset").addEventListener("submit",e=>{e.preventDefault();busyForm(e.target,async()=>{
  const {error}=await sb.auth.resetPasswordForEmail($("#rsEmail").value.trim(),{redirectTo:redirectTo()});
  error?authNote(authErr(error)):authNote("Si hay una cuenta con ese correo, te llegó un enlace para crear una contraseña nueva.",true)})});
$("#fNewPass").addEventListener("submit",e=>{e.preventDefault();busyForm(e.target,async()=>{
  const {error}=await sb.auth.updateUser({password:$("#npPass").value});if(error){authNote(authErr(error));return}
  recovering=false;toast("Contraseña actualizada.");const {data}=await sb.auth.getSession();onSession(data.session)})});
$("#logout").addEventListener("click",async()=>{await sb.auth.signOut();location.reload()});

let startedFor=null;
async function onSession(session){
  if(recovering)return;
  if(!session){startedFor=null;showAuth("login");return}
  const u=session.user;if(startedFor===u.id)return;startedFor=u.id;hideAuth();
  S.me={id:u.id,name:(u.user_metadata&&u.user_metadata.full_name)||u.email.split("@")[0],color:colorFor(u.id)};S.canEdit=false;S.canWrite=true;
  store=sbStore(sb,u.id);
  await loadPeople();
  try{S.profile=await store.loadProfile()}catch(e){S.profile={teamId:""}}
  store.watchConfig(onConfig);setTab(S.tab);
}

function boot(){
  try{const t=localStorage.getItem("alterna:tab");if(t&&document.getElementById("v-"+t))S.tab=t}catch(e){}
  if(weekDays(0)[4]<todayStr)S.week=1;
  const cfg=window.ALTERNA_CONFIG||{};
  if(!window.supabase||!cfg.supabaseUrl){$("#auth").hidden=false;authNote("Falta configurar la conexión con Supabase en config.js.");return}
  sb=window.supabase.createClient(cfg.supabaseUrl,cfg.supabaseKey);
  sb.auth.onAuthStateChange((ev,session)=>{
    if(ev==="PASSWORD_RECOVERY"){recovering=true;showAuth("newpass");return}
    setTimeout(()=>onSession(session),0)});
}
boot();
})();
