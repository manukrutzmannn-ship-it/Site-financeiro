// FinanFamília — configure estes dois valores no painel do Supabase.
const SUPABASE_URL = "https://xziqptnttnltsushxkuo.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_6pHOGHUyzBxdMvQHJ0A32g_trwg8Bh2";

const isConfigured = SUPABASE_URL.startsWith("https://") && !SUPABASE_URL.includes("COLE_AQUI") && SUPABASE_ANON_KEY.length > 30 && !SUPABASE_ANON_KEY.includes("COLE_AQUI");
const sb = isConfigured && window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;
const $ = (id) => document.getElementById(id);
let currentUser = null, familyId = null, familyName = "Minha família", transactions = [], bills = [], goals = [], valuesHidden = false;
const money = n => valuesHidden ? "••••••" : new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(Number(n)||0);
const today = () => new Date().toLocaleDateString("en-CA");
const dateBR = s => s ? new Date(s+"T12:00:00").toLocaleDateString("pt-BR",{day:"2-digit",month:"short",year:"numeric"}) : "Sem data";
const monthKey = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
const escapeHTML = s => String(s ?? "").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
function toast(message,error=false){const el=$("toast");el.textContent=message;el.classList.toggle("error",error);el.classList.add("show");setTimeout(()=>el.classList.remove("show"),3500)}
function showAuth(){ $("auth-screen").hidden=false;$("app-screen").hidden=true; }
function showApp(){ $("auth-screen").hidden=true;$("app-screen").hidden=false; }
function showSetup(){ $("setup-warning").hidden=false; }
function openModal(id){$(id).hidden=false;document.body.style.overflow="hidden"}
function closeModal(id){$(id).hidden=true;document.body.style.overflow=""}
function setBusy(form,busy){const b=form.querySelector('[type="submit"]');if(b){b.disabled=busy;b.dataset.oldText??=b.textContent;b.textContent=busy?"Aguarde…":b.dataset.oldText}}
function showView(view){document.querySelectorAll(".view").forEach(v=>v.hidden=true);$(`${view}-view`).hidden=false;document.querySelectorAll("[data-view]").forEach(b=>b.classList.toggle("active",b.dataset.view===view));const labels={dashboard:"Visão geral",transactions:"Movimentações",bills:"Contas a pagar",goals:"Metas financeiras"};$("page-title").textContent=labels[view]||"Visão geral";if(view==="transactions")renderTransactions();if(view==="bills")renderBills();if(view==="goals")renderGoals();window.scrollTo({top:0,behavior:"smooth"})}
async function loadProfile(){
  const {data:{user},error}=await sb.auth.getUser();if(error||!user){showAuth();return}
  currentUser=user;
  const {data:profile,error:profileError}=await sb.from("profiles").select("full_name,family_id").eq("id",user.id).maybeSingle();
  if(profileError){toast("Não foi possível carregar seu perfil. Confira o SQL e as permissões no Supabase.",true);showAuth();return}
  if(!profile?.family_id){
    // Conta criada com confirmação de e-mail: conclui a configuração da família no primeiro login.
    const suggestedName = (user.user_metadata?.full_name || user.email?.split("@")[0] || "").trim();
    const fullName = (suggestedName && suggestedName.includes(" ") ? suggestedName : prompt("Antes de continuar, informe seu nome completo:", suggestedName))?.trim();
    if(!fullName){toast("Para continuar, informe seu nome e conclua a configuração da família.",true);showAuth();return}
    const famName = prompt("Qual será o nome da sua família?", "Minha família")?.trim();
    if(!famName){toast("Configuração cancelada. Entre novamente para concluir a criação da família.",true);showAuth();return}
    try {
      const {error:setupError}=await sb.rpc("create_family_for_current_user",{family_name:famName,full_name:fullName});
      if(setupError) throw setupError;
      const {data:updatedProfile,error:updatedError}=await sb.from("profiles").select("full_name,family_id").eq("id",user.id).single();
      if(updatedError || !updatedProfile?.family_id) throw updatedError || new Error("A família foi criada, mas o perfil ainda não foi vinculado.");
      profile = updatedProfile;
    } catch(setupError) {
      console.error("Erro ao concluir a configuração da família:", setupError);
      toast(setupError.message || "Não foi possível criar a família. Confira se executou o arquivo supabase.sql atualizado.",true);
      showAuth();return;
    }
  }
  familyId=profile.family_id;
  const {data:family,error:familyError}=await sb.from("families").select("name").eq("id",familyId).single();
  if(familyError){toast("Não foi possível carregar a família.",true);return}
  familyName=family.name;$("family-name-label").textContent=familyName;$("user-name").textContent=profile.full_name||user.email;$("user-email").textContent=user.email;$("user-avatar").textContent=(profile.full_name||user.email||"F").charAt(0).toUpperCase();
  $("today-label").textContent=new Date().toLocaleDateString("pt-BR",{weekday:"long",day:"numeric",month:"long",year:"numeric"});
  $("month-label").textContent=new Date().toLocaleDateString("pt-BR",{month:"long",year:"numeric"});
  showApp();await refreshData();
}
async function refreshData(){
  if(!sb||!familyId)return;
  const [t,b,g]=await Promise.all([
    sb.from("transactions").select("*").eq("family_id",familyId).order("transaction_date",{ascending:false}).limit(500),
    sb.from("bills").select("*").eq("family_id",familyId).order("due_date",{ascending:true}),
    sb.from("goals").select("*").eq("family_id",familyId).order("created_at",{ascending:false})
  ]);
  if(t.error||b.error||g.error){toast("Erro ao carregar dados. Confira as políticas RLS do banco.",true);return}
  transactions=t.data||[];bills=b.data||[];goals=g.data||[];renderDashboard();renderTransactions();renderBills();renderGoals();
}
function renderDashboard(){
  const now=new Date(),mk=monthKey(now),monthTx=transactions.filter(t=>String(t.transaction_date).slice(0,7)===mk);
  const income=monthTx.filter(t=>t.type==="income").reduce((s,t)=>s+Number(t.amount),0),expense=monthTx.filter(t=>t.type==="expense").reduce((s,t)=>s+Number(t.amount),0);
  const allIncome=transactions.filter(t=>t.type==="income").reduce((s,t)=>s+Number(t.amount),0),allExpense=transactions.filter(t=>t.type==="expense").reduce((s,t)=>s+Number(t.amount),0);
  $("total-balance").textContent=money(allIncome-allExpense);$("month-income").textContent=money(income);$("month-expense").textContent=money(expense);$("month-result").textContent=money(income-expense);
  const recent=transactions.slice(0,5);$("recent-list").innerHTML=recent.length?recent.map(transactionHTML).join(""):'<div class="empty-state">Nenhuma movimentação cadastrada ainda. Use “Nova movimentação” para começar.</div>';
  renderChart();renderCategories();
}
function transactionHTML(t){const income=t.type==="income";return `<div class="transaction-row"><div class="tx-main"><div class="tx-symbol ${income?"":"expense"}">${income?"↗":"↘"}</div><div><strong>${escapeHTML(t.description)}</strong><small>${escapeHTML(t.category||"Outros")} · ${dateBR(t.transaction_date)}${t.responsible?" · "+escapeHTML(t.responsible):""}</small></div></div><div class="tx-amount ${income?"income":"expense"}">${income?"+":"−"} ${money(t.amount)}</div><button class="tx-delete" title="Excluir movimentação" aria-label="Excluir movimentação" data-delete-tx="${t.id}">×</button></div>`}
function renderTransactions(){const search=($("transaction-search")?.value||"").toLowerCase(),filter=$("transaction-filter")?.value||"all";const list=transactions.filter(t=>(filter==="all"||t.type===filter)&&(`${t.description} ${t.category} ${t.responsible||""}`).toLowerCase().includes(search));$("all-transactions").innerHTML=list.length?list.map(transactionHTML).join(""):'<div class="empty-state">Nenhuma movimentação encontrada.</div>'}
function renderChart(){const holder=$("monthly-chart"),months=[];for(let i=5;i>=0;i--){const d=new Date();d.setDate(1);d.setMonth(d.getMonth()-i);const key=monthKey(d);const arr=transactions.filter(t=>String(t.transaction_date).slice(0,7)===key);months.push({key,label:d.toLocaleDateString("pt-BR",{month:"short"}).replace(".",""),income:arr.filter(t=>t.type==="income").reduce((s,t)=>s+Number(t.amount),0),expense:arr.filter(t=>t.type==="expense").reduce((s,t)=>s+Number(t.amount),0)})}const max=Math.max(1,...months.flatMap(m=>[m.income,m.expense]));holder.innerHTML=months.some(m=>m.income||m.expense)?months.map(m=>`<div class="chart-column"><div class="bar-pair"><div class="bar income" title="Receitas: ${money(m.income)}" style="height:${Math.max(m.income?3:0,m.income/max*100)}%"></div><div class="bar expense" title="Despesas: ${money(m.expense)}" style="height:${Math.max(m.expense?3:0,m.expense/max*100)}%"></div></div><span class="chart-month">${escapeHTML(m.label)}</span></div>`).join(""):'<div class="empty-state">Adicione movimentações para ver seu gráfico.</div>'}
function renderCategories(){const expenses=transactions.filter(t=>t.type==="expense"&&String(t.transaction_date).slice(0,7)===monthKey(new Date()));const map={};expenses.forEach(t=>map[t.category||"Outros"]=(map[t.category||"Outros"]||0)+Number(t.amount));const rows=Object.entries(map).sort((a,b)=>b[1]-a[1]).slice(0,5),total=rows.reduce((s,r)=>s+r[1],0);$("category-list").innerHTML=rows.length?rows.map(([name,value])=>`<div class="category-row"><div class="category-icon">${categoryIcon(name)}</div><div class="category-info"><strong>${escapeHTML(name)}</strong><div class="category-track"><span style="width:${Math.max(2,value/Math.max(total,1)*100)}%"></span></div></div><div class="category-amount">${money(value)}</div></div>`).join(""):'<div class="empty-state">As categorias aparecem aqui quando você registrar despesas.</div>'}
function categoryIcon(name){return ({"Alimentação":"⌁","Moradia":"⌂","Transporte":"↗","Saúde":"＋","Educação":"▤","Lazer":"☆","Salário":"↙","Contas da casa":"▣","Compras":"◇"}[name]||"•")}
function renderBills(){$("bills-list").innerHTML=bills.length?bills.map(b=>`<article class="bill-card"><div class="bill-top"><span class="bill-icon">▣</span><span class="status ${b.paid?"paid":""}">${b.paid?"Paga":(b.due_date<today()?"Vencida":"Pendente")}</span></div><h3>${escapeHTML(b.title)}</h3><p>${escapeHTML(b.category||"Outros")} · Vence em ${dateBR(b.due_date)}</p><div class="bill-value">${money(b.amount)}</div><div class="bill-actions">${b.paid?`<button class="small-btn" data-bill-toggle="${b.id}" data-paid="false">Reabrir conta</button>`:`<button class="small-btn" data-bill-toggle="${b.id}" data-paid="true">Marcar como paga</button>`}<button class="small-btn" data-bill-delete="${b.id}">Excluir</button></div></article>`).join(""):'<div class="empty-state">Nenhuma conta cadastrada. Adicione água, luz, internet ou outras despesas previstas.</div>'}
function renderGoals(){$("goals-list").innerHTML=goals.length?goals.map(g=>{const target=Number(g.target_amount),saved=Number(g.saved_amount),pct=Math.min(100,target?Math.round(saved/target*100):0);return `<article class="goal-card"><div class="goal-top"><span class="bill-icon">◎</span><span class="goal-percent">${pct}%</span></div><h3>${escapeHTML(g.title)}</h3><p>${g.deadline?"Prazo: "+dateBR(g.deadline):"Meta da família"}</p><div class="goal-progress"><span style="width:${pct}%"></span></div><div class="goal-meta"><span><b class="goal-amount">${money(saved)}</b> guardados</span><span>de ${money(target)}</span></div><div class="bill-actions"><button class="small-btn" data-goal-add="${g.id}">Atualizar valor guardado</button><button class="small-btn" data-goal-delete="${g.id}">Excluir</button></div></article>`}).join(""):'<div class="empty-state">Crie sua primeira meta, como uma reserva de emergência ou uma viagem em família.</div>'}
async function handleError(error,fallback){console.error(error);toast(error?.message||fallback,true)}
async function createFamilyForUser(user,fullName,famName){
  // O RPC cria família + perfil numa transação no servidor, sem expor privilégios administrativos no navegador.
  const {error}=await sb.rpc("create_family_for_current_user",{family_name:famName,full_name:fullName});
  if(error)throw error;
}
async function boot(){if(!sb){showAuth();showSetup();return}const {data:{session}}=await sb.auth.getSession();if(session)await loadProfile();else showAuth();sb.auth.onAuthStateChange((_event,session)=>{if(session){setTimeout(()=>loadProfile(),0)}else{currentUser=null;familyId=null;showAuth()}})}
document.querySelectorAll("[data-auth-tab]").forEach(btn=>btn.addEventListener("click",()=>{document.querySelectorAll("[data-auth-tab]").forEach(b=>b.classList.toggle("active",b===btn));const signup=btn.dataset.authTab==="signup";$("login-form").hidden=signup;$("signup-form").hidden=!signup}));
$("login").addEventListener("submit",async e=>{e.preventDefault();if(!sb)return showSetup();setBusy(e.currentTarget,true);try{const {error}=await sb.auth.signInWithPassword({email:$("login-email").value.trim(),password:$("login-password").value});if(error)throw error;toast("Login realizado com sucesso.")}catch(err){handleError(err,"Não foi possível entrar.")}finally{setBusy(e.currentTarget,false)}});
$("signup").addEventListener("submit",async e=>{e.preventDefault();if(!sb)return showSetup();const form=e.currentTarget;setBusy(form,true);try{const email=$("signup-email").value.trim(),password=$("signup-password").value,name=$("signup-name").value.trim(),fam=$("family-name").value.trim();const {data,error}=await sb.auth.signUp({email,password,options:{data:{full_name:name}}});if(error)throw error;if(!data.user)throw new Error("Não foi possível criar o usuário.");if(!data.session){toast("Confira seu e-mail para confirmar a conta. Depois entre e conclua a configuração da família.");return}await createFamilyForUser(data.user,name,fam);toast("Conta e família criadas!");await loadProfile()}catch(err){handleError(err,"Não foi possível criar a conta. Confira a configuração do Supabase.")}finally{setBusy(form,false)}});
$("forgot-password").addEventListener("click",async()=>{if(!sb)return showSetup();const email=$("login-email").value.trim();if(!email)return toast("Digite seu e-mail no campo acima primeiro.",true);const {error}=await sb.auth.resetPasswordForEmail(email,{redirectTo:location.origin+location.pathname});if(error)handleError(error,"Não foi possível enviar o e-mail.");else toast("Se o e-mail estiver cadastrado, você receberá instruções para redefinir a senha.")});
$("signout").addEventListener("click",async()=>{if(sb)await sb.auth.signOut();showAuth()});
document.querySelectorAll("[data-view]").forEach(b=>b.addEventListener("click",()=>showView(b.dataset.view)));document.querySelectorAll("[data-goto]").forEach(b=>b.addEventListener("click",()=>showView(b.dataset.goto)));
$("toggle-values").addEventListener("click",()=>{valuesHidden=!valuesHidden;$("toggle-values").textContent=valuesHidden?"◎":"◉";renderDashboard();renderTransactions();renderBills();renderGoals()});
$("open-add").addEventListener("click",()=>{if(!sb)return showSetup();$("tx-date").value=today();$("transaction-form").reset();$("tx-date").value=today();openModal("transaction-modal")});
$("open-add-2").addEventListener("click",()=>$("open-add").click());
$("open-bill").addEventListener("click",()=>{if(!sb)return showSetup();$("bill-form").reset();$("bill-due").value=today();openModal("bill-modal")});
$("open-goal").addEventListener("click",()=>{if(!sb)return showSetup();$("goal-form").reset();openModal("goal-modal")});
document.querySelectorAll("[data-close]").forEach(b=>b.addEventListener("click",()=>closeModal(b.dataset.close)));document.querySelectorAll(".modal-backdrop").forEach(m=>m.addEventListener("click",e=>{if(e.target===m)closeModal(m.id)}));document.addEventListener("keydown",e=>{if(e.key==="Escape")document.querySelectorAll(".modal-backdrop:not([hidden])").forEach(m=>closeModal(m.id))});
$("transaction-form").addEventListener("submit",async e=>{e.preventDefault();if(!sb||!familyId)return showSetup();const form=e.currentTarget;setBusy(form,true);try{const {error}=await sb.from("transactions").insert({family_id:familyId,created_by:currentUser.id,type:form.querySelector('input[name="type"]:checked').value,description:$("tx-description").value.trim(),amount:Number($("tx-amount").value),transaction_date:$("tx-date").value,category:$("tx-category").value,responsible:$("tx-person").value.trim()||null,notes:$("tx-notes").value.trim()||null});if(error)throw error;closeModal("transaction-modal");toast("Movimentação salva.");await refreshData()}catch(err){handleError(err,"Não foi possível salvar a movimentação.")}finally{setBusy(form,false)}});
$("transaction-search").addEventListener("input",renderTransactions);$("transaction-filter").addEventListener("change",renderTransactions);
document.addEventListener("click",async e=>{const tx=e.target.closest("[data-delete-tx]");if(tx){if(!confirm("Excluir esta movimentação?"))return;const {error}=await sb.from("transactions").delete().eq("id",tx.dataset.deleteTx).eq("family_id",familyId);if(error)handleError(error,"Não foi possível excluir.");else{toast("Movimentação excluída.");await refreshData()}return}
const toggle=e.target.closest("[data-bill-toggle]");if(toggle){const {error}=await sb.from("bills").update({paid:toggle.dataset.paid==="true"}).eq("id",toggle.dataset.billToggle).eq("family_id",familyId);if(error)handleError(error,"Não foi possível atualizar a conta.");else{toast("Status da conta atualizado.");await refreshData()}return}
const delBill=e.target.closest("[data-bill-delete]");if(delBill){if(!confirm("Excluir esta conta?"))return;const {error}=await sb.from("bills").delete().eq("id",delBill.dataset.billDelete).eq("family_id",familyId);if(error)handleError(error,"Não foi possível excluir.");else await refreshData();return}
const delGoal=e.target.closest("[data-goal-delete]");if(delGoal){if(!confirm("Excluir esta meta?"))return;const {error}=await sb.from("goals").delete().eq("id",delGoal.dataset.goalDelete).eq("family_id",familyId);if(error)handleError(error,"Não foi possível excluir.");else await refreshData();return}
const addGoal=e.target.closest("[data-goal-add]");if(addGoal){const goal=goals.find(g=>g.id===addGoal.dataset.goalAdd);const answer=prompt(`Quanto já foi guardado para “${goal.title}” no total?`,String(goal.saved_amount));if(answer===null)return;const amount=Number(answer.replace(",","."));if(!Number.isFinite(amount)||amount<0)return toast("Digite um valor válido.",true);const {error}=await sb.from("goals").update({saved_amount:amount}).eq("id",goal.id).eq("family_id",familyId);if(error)handleError(error,"Não foi possível atualizar a meta.");else{toast("Meta atualizada.");await refreshData()}}
});
$("bill-form").addEventListener("submit",async e=>{e.preventDefault();const form=e.currentTarget;setBusy(form,true);try{const {error}=await sb.from("bills").insert({family_id:familyId,created_by:currentUser.id,title:$("bill-title").value.trim(),amount:Number($("bill-amount").value),due_date:$("bill-due").value,category:$("bill-category").value});if(error)throw error;closeModal("bill-modal");toast("Conta cadastrada.");await refreshData()}catch(err){handleError(err,"Não foi possível cadastrar a conta.")}finally{setBusy(form,false)}});
$("goal-form").addEventListener("submit",async e=>{e.preventDefault();const form=e.currentTarget;setBusy(form,true);try{const deadline=$("goal-deadline").value||null;const {error}=await sb.from("goals").insert({family_id:familyId,created_by:currentUser.id,title:$("goal-title").value.trim(),target_amount:Number($("goal-target").value),saved_amount:Number($("goal-saved").value),deadline});if(error)throw error;closeModal("goal-modal");toast("Meta criada.");await refreshData()}catch(err){handleError(err,"Não foi possível criar a meta.")}finally{setBusy(form,false)}});
boot();
