/* =========================================================
   نظام المحاسبة وإدارة المحل التجاري - app.js
   ========================================================= */

/* ---------- الصلاحيات ---------- */
const PERMISSIONS = {
  sales:"المبيعات", salesReturns:"مردود المبيعات", purchases:"المشتريات", purchasesReturns:"مردود المشتريات",
  inventory:"المخزون", invoicesList:"قائمة الفواتير", customers:"العملاء", suppliers:"الموردون",
  cash:"الصندوق والبنوك", expenses:"المصروفات", accounts:"الحسابات", accounting:"المحاسبة",
  reports:"التقارير", users:"المستخدمون والصلاحيات", backup:"النسخ الاحتياطي", settings:"الإعدادات"
};
const defaultPermissions = Object.keys(PERMISSIONS);
const nameToKey = Object.fromEntries(Object.entries(PERMISSIONS).map(([k,v])=>[v,k]));
const UNITS = ["قطعة","كيلو","سطل","لتر","برميل","علبة","كرتونة","شوال","طن","متر"];
const EXPENSE_CATEGORIES = ["إيجار","رواتب","كهرباء","ماء","مواصلات","صيانة","اتصالات","ضيافة","أخرى"];
const DATA_KEYS = ["erp_items","erp_customers","erp_suppliers","erp_sales","erp_sales_returns",
  "erp_purchases","erp_purchases_returns","erp_vouchers","erp_expenses","erp_settings","erp_counters","erp_users"];

/* ---------- أدوات عامة ---------- */
function getArr(key){try{return JSON.parse(localStorage.getItem(key)||"[]")}catch(e){return []}}
function setArr(key,val){localStorage.setItem(key,JSON.stringify(val))}
function uid(){return crypto.randomUUID()}
function todayISO(){return new Date().toISOString().slice(0,10)}
function fmt(n){return (Number(n)||0).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}
function escapeHtml(s){return String(s==null?"":s).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[m]))}
function inRange(dateStr,from,to){return (!from||dateStr>=from) && (!to||dateStr<=to)}
function nextNumber(prefix,key){
  const counters=JSON.parse(localStorage.getItem("erp_counters")||"{}");
  counters[key]=(counters[key]||0)+1;
  localStorage.setItem("erp_counters",JSON.stringify(counters));
  return prefix+String(counters[key]).padStart(4,"0");
}
function getSettings(){
  return JSON.parse(localStorage.getItem("erp_settings")||'{"storeName":"متجرك التجاري","address":"","currency":"₪","openingCash":0,"openingBank":0}');
}
function setSettings(s){localStorage.setItem("erp_settings",JSON.stringify(s))}
function money(n){return fmt(n)+" "+getSettings().currency}

/* ---------- طبقة البيانات ---------- */
const getItems=()=>getArr("erp_items"), saveItems=v=>setArr("erp_items",v);
const getCustomers=()=>getArr("erp_customers"), saveCustomers=v=>setArr("erp_customers",v);
const getSuppliers=()=>getArr("erp_suppliers"), saveSuppliers=v=>setArr("erp_suppliers",v);
const getSales=()=>getArr("erp_sales"), saveSales=v=>setArr("erp_sales",v);
const getSalesReturns=()=>getArr("erp_sales_returns"), saveSalesReturns=v=>setArr("erp_sales_returns",v);
const getPurchases=()=>getArr("erp_purchases"), savePurchases=v=>setArr("erp_purchases",v);
const getPurchasesReturns=()=>getArr("erp_purchases_returns"), savePurchasesReturns=v=>setArr("erp_purchases_returns",v);
const getVouchers=()=>getArr("erp_vouchers"), saveVouchers=v=>setArr("erp_vouchers",v);
const getExpenses=()=>getArr("erp_expenses"), saveExpenses=v=>setArr("erp_expenses",v);

function adjustStock(itemId,delta){
  const items=getItems(); const it=items.find(i=>i.id===itemId);
  if(it){ it.qty=(Number(it.qty)||0)+delta; saveItems(items); }
}

/* ---------- حسابات الأرصدة ---------- */
function customerBalance(id){
  const c=getCustomers().find(x=>x.id===id); if(!c) return 0;
  let bal=Number(c.openingBalance)||0;
  getSales().filter(s=>s.customerId===id).forEach(s=>{bal += (Number(s.total)||0)-(Number(s.paid)||0)});
  getSalesReturns().filter(r=>r.customerId===id).forEach(r=>{bal -= Number(r.total)||0});
  getVouchers().filter(v=>v.partyType==="customer"&&v.partyId===id).forEach(v=>{bal += v.type==="receipt"?-Number(v.amount):Number(v.amount)});
  return bal;
}
function supplierBalance(id){
  const s0=getSuppliers().find(x=>x.id===id); if(!s0) return 0;
  let bal=Number(s0.openingBalance)||0;
  getPurchases().filter(p=>p.supplierId===id).forEach(p=>{bal += (Number(p.total)||0)-(Number(p.paid)||0)});
  getPurchasesReturns().filter(r=>r.supplierId===id).forEach(r=>{bal -= Number(r.total)||0});
  getVouchers().filter(v=>v.partyType==="supplier"&&v.partyId===id).forEach(v=>{bal += v.type==="payment"?-Number(v.amount):Number(v.amount)});
  return bal;
}
function cashBalance(){
  const s=getSettings(); let bal=Number(s.openingCash)||0;
  getSales().forEach(s2=>bal += Number(s2.paid)||0);
  getPurchases().forEach(p=>bal -= Number(p.paid)||0);
  getExpenses().forEach(e=>bal -= Number(e.amount)||0);
  getVouchers().filter(v=>v.account==="cash").forEach(v=>bal += v.type==="receipt"?Number(v.amount):-Number(v.amount));
  return bal;
}
function bankBalance(){
  const s=getSettings(); let bal=Number(s.openingBank)||0;
  getVouchers().filter(v=>v.account==="bank").forEach(v=>bal += v.type==="receipt"?Number(v.amount):-Number(v.amount));
  return bal;
}
function stockValue(){return getItems().reduce((a,i)=>a+(Number(i.qty)||0)*(Number(i.purchasePrice)||0),0)}
function totalReceivable(){return getCustomers().reduce((a,c)=>a+customerBalance(c.id),0)}
function totalPayable(){return getSuppliers().reduce((a,s)=>a+supplierBalance(s.id),0)}

/* =========================================================
   المستخدمون وتسجيل الدخول
   ========================================================= */
async function hashPassword(password){
  const data = new TextEncoder().encode(password);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(hash)].map(b=>b.toString(16).padStart(2,"0")).join("");
}
function getUsers(){ return JSON.parse(localStorage.getItem("erp_users") || "[]"); }
async function ensureAdmin(){
  let users=getUsers();
  if(!users.length){
    users=[{
      id:crypto.randomUUID(),username:"Admin",name:"مدير النظام",
      passwordHash:await hashPassword("05699"),role:"manager",
      permissions:defaultPermissions,active:true
    }];
    localStorage.setItem("erp_users",JSON.stringify(users));
  }
}
function getCurrentUser(){
  const id=localStorage.getItem("erp_session");
  return getUsers().find(u=>u.id===id) || null;
}
function hasPermission(key){
  const u=getCurrentUser();
  return !!u && u.permissions.includes(key);
}
function applyPermissions(){
  const u=getCurrentUser();
  if(!u)return;
  document.getElementById("currentUserName").textContent=u.name || u.username;
  document.querySelectorAll(".nav").forEach(btn=>{
    const onclick=btn.getAttribute("onclick")||"";
    const match=onclick.match(/navigate\('([^']+)/);
    const name=match?match[1]:"";
    const map=Object.entries(PERMISSIONS).find(([,v])=>v===name);
    if(map) btn.style.display=hasPermission(map[0])?"flex":"none";
  });
  const managerNav=[...document.querySelectorAll(".nav")].find(x=>(x.textContent||"").includes("المستخدمون والصلاحيات"));
  if(managerNav && u.role!=="manager") managerNav.style.display="none";
}
async function login(username,password){
  const user=getUsers().find(u=>u.username.toLowerCase()===username.toLowerCase() && u.active!==false);
  if(!user)return false;
  const ok=(await hashPassword(password))===user.passwordHash;
  if(!ok)return false;
  localStorage.setItem("erp_session",user.id);
  document.getElementById("loginScreen").style.display="none";
  applyPermissions();
  refreshBrand();
  return true;
}
function logout(){
  localStorage.removeItem("erp_session");
  location.reload();
}
document.getElementById("loginForm").addEventListener("submit",async e=>{
  e.preventDefault();
  const err=document.getElementById("loginError");
  err.textContent="";
  const ok=await login(document.getElementById("loginUsername").value.trim(),document.getElementById("loginPassword").value);
  if(!ok)err.textContent="اسم المستخدم أو كلمة المرور غير صحيحة.";
});

function showUsersManager(){
  if(!hasPermission("users") || getCurrentUser().role!=="manager"){
    showToast("هذه الشاشة متاحة للمدير فقط"); return;
  }
  const checks=document.getElementById("permissionChecks");
  checks.innerHTML=Object.entries(PERMISSIONS).map(([k,v])=>
    `<label class="perm-check"><input type="checkbox" value="${k}" checked> ${v}</label>`).join("");
  renderUsers();
  document.getElementById("usersModal").classList.remove("hidden");
}
function closeUsersModal(){document.getElementById("usersModal").classList.add("hidden")}
function renderUsers(){
  const rows=getUsers().map(u=>`<div class="user-row">
    <span><b>${escapeHtml(u.name)}</b><br>${escapeHtml(u.username)}</span>
    <span>${u.role==="manager"?"مدير":u.role==="cashier"?"كاشير":"موظف"}</span>
    <span>${u.active===false?"موقوف":"نشط"}</span>
    <button class="danger" onclick="toggleUser('${u.id}')">${u.username==="admin"?"لا يمكن":u.active===false?"تفعيل":"إيقاف"}</button>
  </div>`).join("");
  document.getElementById("usersList").innerHTML=rows;
}
async function createUser(){
  const username=document.getElementById("newUsername").value.trim();
  const name=document.getElementById("newName").value.trim()||username;
  const password=document.getElementById("newPassword").value;
  const role=document.getElementById("newRole").value;
  const permissions=[...document.querySelectorAll("#permissionChecks input:checked")].map(x=>x.value);
  if(!username||!password){showToast("أدخل اسم المستخدم وكلمة المرور");return}
  let users=getUsers();
  if(users.some(u=>u.username.toLowerCase()===username.toLowerCase())){showToast("اسم المستخدم موجود مسبقاً");return}
  users.push({id:crypto.randomUUID(),username,name,passwordHash:await hashPassword(password),role,permissions,active:true});
  localStorage.setItem("erp_users",JSON.stringify(users));
  ["newUsername","newName","newPassword"].forEach(id=>document.getElementById(id).value="");
  renderUsers();showToast("تم إنشاء المستخدم وتطبيق صلاحياته");
}
function toggleUser(id){
  let users=getUsers();
  const u=users.find(x=>x.id===id);
  if(!u||u.username==="admin")return;
  u.active=u.active===false;
  localStorage.setItem("erp_users",JSON.stringify(users));renderUsers();
}

/* =========================================================
   نافذة عامة (Modal) للنماذج
   ========================================================= */
function openModal(html){
  document.getElementById("modalBox").innerHTML = `<button class="close" onclick="closeModal()">×</button>`+html;
  document.getElementById("modal").classList.remove("hidden");
}
function closeModal(){document.getElementById("modal").classList.add("hidden")}

/* =========================================================
   بناء سطور الفاتورة (مشترك بين البيع/الشراء/المردودات)
   ========================================================= */
let currentMode = "sale"; // 'sale' أو 'purchase' - يحدد أي سعر يُقترح تلقائياً
function itemsDatalistHtml(){
  return `<datalist id="itemsDatalist">${getItems().map(i=>`<option value="${escapeHtml(i.name)}">`).join("")}</datalist>`;
}
function findItemByNameOrBarcode(v){
  v=(v||"").trim().toLowerCase(); if(!v) return null;
  return getItems().find(i=>i.name.toLowerCase()===v || (i.barcode||"").toLowerCase()===v);
}
function lineRowHtml(){
  return `<tr class="line-row">
    <td><input list="itemsDatalist" class="line-name" placeholder="اسم الصنف أو الباركود" oninput="onLineItemInput(this)"></td>
    <td><input type="number" class="line-qty" value="1" min="0.01" step="0.01" oninput="recalcLine(this)"></td>
    <td><input type="number" class="line-price" value="0" min="0" step="0.01" oninput="recalcLine(this)"></td>
    <td class="line-total">0.00</td>
    <td><button type="button" class="danger" onclick="this.closest('tr').remove();recalcGrand()">حذف</button></td>
  </tr>`;
}
function addLineRow(){
  const tbody=document.getElementById("linesBody");
  tbody.insertAdjacentHTML("beforeend", lineRowHtml());
}
function onLineItemInput(el){
  const item=findItemByNameOrBarcode(el.value);
  const row=el.closest("tr");
  if(item){ row.querySelector(".line-price").value = currentMode==="sale" ? item.salePrice : item.purchasePrice; }
  recalcLine(el);
}
function recalcLine(el){
  const row=el.closest("tr");
  const qty=parseFloat(row.querySelector(".line-qty").value)||0;
  const price=parseFloat(row.querySelector(".line-price").value)||0;
  row.querySelector(".line-total").textContent=(qty*price).toFixed(2);
  recalcGrand();
}
function recalcGrand(){
  let total=0;
  document.querySelectorAll("#linesBody .line-total").forEach(td=>total+=parseFloat(td.textContent)||0);
  const gt=document.getElementById("grandTotal"); if(gt) gt.textContent=total.toFixed(2);
  const paidEl=document.getElementById("invPaid");
  const remEl=document.getElementById("remainingAmount");
  if(paidEl && remEl){
    const paid=parseFloat(paidEl.value)||0;
    remEl.textContent=(total-paid).toFixed(2);
  }
}
function collectLines(){
  const rows=[...document.querySelectorAll("#linesBody .line-row")];
  const lines=[]; let error=null;
  for(const row of rows){
    const nameVal=row.querySelector(".line-name").value.trim();
    if(!nameVal) continue;
    const item=findItemByNameOrBarcode(nameVal);
    if(!item){ error=`الصنف "${nameVal}" غير موجود في المخزون`; break; }
    const qty=parseFloat(row.querySelector(".line-qty").value)||0;
    const price=parseFloat(row.querySelector(".line-price").value)||0;
    if(qty<=0){ error="الكمية غير صحيحة"; break; }
    lines.push({itemId:item.id,name:item.name,unit:item.unit,qty,price,total:qty*price});
  }
  return {lines,error};
}

/* =========================================================
   فواتير البيع / الشراء
   ========================================================= */
function openInvoiceForm(mode){
  if(mode==="sale" && !hasPermission("sales")){showToast("ليس لديك صلاحية المبيعات");return}
  if(mode==="purchase" && !hasPermission("purchases")){showToast("ليس لديك صلاحية المشتريات");return}
  currentMode=mode;
  const partyLabel = mode==="sale" ? "الزبون" : "المورد";
  const parties = mode==="sale" ? getCustomers() : getSuppliers();
  const partyOptions = parties.map(p=>`<option value="${escapeHtml(p.name)}">`).join("");
  openModal(`
    <h2>${mode==="sale"?"فاتورة بيع جديدة":"فاتورة شراء جديدة"}</h2>
    <label>${partyLabel}</label>
    <input id="invParty" list="partyList" placeholder="ابحث بالاسم${mode==="sale"?" (اتركه فارغاً لعميل نقدي)":""}">
    <datalist id="partyList">${partyOptions}</datalist>
    ${itemsDatalistHtml()}
    <table class="lines-table"><thead><tr><th>الصنف</th><th>الكمية</th><th>السعر</th><th>الإجمالي</th><th></th></tr></thead>
    <tbody id="linesBody"></tbody></table>
    <button type="button" class="secondary" onclick="addLineRow()">＋ إضافة صنف</button>
    <div class="inv-summary">
      <div><span>الإجمالي</span><b id="grandTotal">0.00</b></div>
      <div><span>المبلغ المدفوع</span><input id="invPaid" type="number" value="0" min="0" style="width:110px" oninput="recalcGrand()"></div>
      <div><span>المتبقي</span><b id="remainingAmount">0.00</b></div>
    </div>
    <button class="primary full" onclick="saveInvoice('${mode}')">حفظ الفاتورة</button>
  `);
  addLineRow();
}
function saveInvoice(mode){
  const partyName=document.getElementById("invParty").value.trim();
  const {lines,error}=collectLines();
  if(error){showToast(error);return}
  if(!lines.length){showToast("أضف صنفاً واحداً على الأقل");return}
  const total=lines.reduce((a,l)=>a+l.total,0);
  const paid=parseFloat(document.getElementById("invPaid").value)||0;

  if(mode==="sale"){
    let customer=partyName?getCustomers().find(c=>c.name===partyName):null;
    if(!customer && partyName){
      customer={id:uid(),name:partyName,phone:"",address:"",openingBalance:0};
      const cs=getCustomers();cs.push(customer);saveCustomers(cs);
    }
    const inv={id:uid(),number:nextNumber("S-","sales"),date:todayISO(),
      customerId:customer?customer.id:null, customerName:customer?customer.name:"عميل نقدي",
      items:lines,total,paid,remaining:total-paid};
    const list=getSales(); list.push(inv); saveSales(list);
    lines.forEach(l=>adjustStock(l.itemId,-l.qty));
    showToast("تم حفظ فاتورة البيع رقم "+inv.number);
  } else {
    if(!partyName){showToast("يرجى إدخال اسم المورد");return}
    let supplier=getSuppliers().find(s=>s.name===partyName);
    if(!supplier){
      supplier={id:uid(),name:partyName,phone:"",address:"",openingBalance:0};
      const ss=getSuppliers();ss.push(supplier);saveSuppliers(ss);
    }
    const inv={id:uid(),number:nextNumber("P-","purchases"),date:todayISO(),
      supplierId:supplier.id, supplierName:supplier.name,
      items:lines,total,paid,remaining:total-paid};
    const list=getPurchases(); list.push(inv); savePurchases(list);
    lines.forEach(l=>adjustStock(l.itemId,l.qty));
    showToast("تم حفظ فاتورة الشراء رقم "+inv.number);
  }
  closeModal();
  refreshCurrentView();
}

/* =========================================================
   مردودات المبيعات / المشتريات
   ========================================================= */
function openReturnForm(mode){
  if(mode==="sale" && !hasPermission("salesReturns")){showToast("ليس لديك صلاحية مردود المبيعات");return}
  if(mode==="purchase" && !hasPermission("purchasesReturns")){showToast("ليس لديك صلاحية مردود المشتريات");return}
  currentMode=mode;
  const label = mode==="sale" ? "الزبون" : "المورد";
  const parties = mode==="sale" ? getCustomers() : getSuppliers();
  openModal(`
    <h2>${mode==="sale"?"مردود مبيعات":"مردود مشتريات"}</h2>
    <label>رقم الفاتورة الأصلية (اختياري)</label>
    <input id="retRefNumber" placeholder="مثال: ${mode==="sale"?"S-0001":"P-0001"}">
    <label>${label}</label>
    <input id="invParty" list="partyList" placeholder="ابحث بالاسم">
    <datalist id="partyList">${parties.map(p=>`<option value="${escapeHtml(p.name)}">`).join("")}</datalist>
    ${itemsDatalistHtml()}
    <table class="lines-table"><thead><tr><th>الصنف</th><th>الكمية</th><th>السعر</th><th>الإجمالي</th><th></th></tr></thead>
    <tbody id="linesBody"></tbody></table>
    <button type="button" class="secondary" onclick="addLineRow()">＋ إضافة صنف</button>
    <div class="inv-summary"><div><span>إجمالي المردود</span><b id="grandTotal">0.00</b></div></div>
    <button class="primary full" onclick="saveReturn('${mode}')">حفظ المردود</button>
  `);
  addLineRow();
}
function saveReturn(mode){
  const partyName=document.getElementById("invParty").value.trim();
  const refNumber=document.getElementById("retRefNumber").value.trim();
  const {lines,error}=collectLines();
  if(error){showToast(error);return}
  if(!lines.length){showToast("أضف صنفاً واحداً على الأقل");return}
  const total=lines.reduce((a,l)=>a+l.total,0);

  if(mode==="sale"){
    const customer=partyName?getCustomers().find(c=>c.name===partyName):null;
    const ret={id:uid(),number:nextNumber("SR-","salesReturns"),date:todayISO(),
      customerId:customer?customer.id:null, customerName:customer?customer.name:(partyName||"عميل نقدي"),
      refNumber, items:lines,total};
    const list=getSalesReturns();list.push(ret);saveSalesReturns(list);
    lines.forEach(l=>adjustStock(l.itemId,l.qty));
    showToast("تم حفظ مردود المبيعات رقم "+ret.number);
  } else {
    const supplier=getSuppliers().find(s=>s.name===partyName);
    if(!supplier){showToast("يرجى إدخال اسم المورد");return}
    const ret={id:uid(),number:nextNumber("PR-","purchasesReturns"),date:todayISO(),
      supplierId:supplier.id, supplierName:supplier.name,
      refNumber, items:lines,total};
    const list=getPurchasesReturns();list.push(ret);savePurchasesReturns(list);
    lines.forEach(l=>adjustStock(l.itemId,-l.qty));
    showToast("تم حفظ مردود المشتريات رقم "+ret.number);
  }
  closeModal();
  refreshCurrentView();
}

/* =========================================================
   عرض فاتورة/مردود (للتأكد منها)
   ========================================================= */
function viewInvoice(type,id){
  let rec,title,partyLabel;
  if(type==="sale"){rec=getSales().find(x=>x.id===id);title="فاتورة بيع "+(rec?rec.number:"");partyLabel="الزبون";}
  else if(type==="saleReturn"){rec=getSalesReturns().find(x=>x.id===id);title="مردود مبيعات "+(rec?rec.number:"");partyLabel="الزبون";}
  else if(type==="purchase"){rec=getPurchases().find(x=>x.id===id);title="فاتورة شراء "+(rec?rec.number:"");partyLabel="المورد";}
  else {rec=getPurchasesReturns().find(x=>x.id===id);title="مردود مشتريات "+(rec?rec.number:"");partyLabel="المورد";}
  if(!rec){showToast("لم يتم العثور على الفاتورة");return}
  const party=rec.customerName||rec.supplierName||"-";
  const itemsHtml=rec.items.map(l=>`<tr><td>${escapeHtml(l.name)}</td><td>${escapeHtml(l.unit||"")}</td><td>${l.qty}</td><td>${fmt(l.price)}</td><td>${fmt(l.total)}</td></tr>`).join("");
  openModal(`<h2>${title}</h2>
   <p class="muted">${partyLabel}: <b>${escapeHtml(party)}</b> — التاريخ: ${rec.date}${rec.refNumber?` — مرجع: ${escapeHtml(rec.refNumber)}`:""}</p>
   <table class="module-table"><thead><tr><th>الصنف</th><th>الوحدة</th><th>الكمية</th><th>السعر</th><th>الإجمالي</th></tr></thead><tbody>${itemsHtml}</tbody></table>
   <div class="inv-summary">
     <div><span>الإجمالي</span><b>${fmt(rec.total)}</b></div>
     ${rec.paid!==undefined?`<div><span>المدفوع</span><b>${fmt(rec.paid)}</b></div><div><span>المتبقي</span><b>${fmt(rec.remaining)}</b></div>`:""}
   </div>
   <button class="primary full" onclick="window.print()">🖨 طباعة</button>`);
}

/* =========================================================
   قوائم الفواتير (المبيعات / المشتريات / المردودات / الكل)
   ========================================================= */
function renderSales(){
  document.getElementById("module").innerHTML = `
    <div class="module-head"><h3>فواتير المبيعات</h3></div>
    <div class="module-actions">
      <input class="search" id="listSearch" placeholder="بحث برقم الفاتورة أو اسم الزبون..." oninput="renderSalesRows()">
      <button class="primary" onclick="openInvoiceForm('sale')">＋ فاتورة بيع جديدة</button>
    </div>
    <table class="module-table"><thead><tr><th>رقم الفاتورة</th><th>التاريخ</th><th>الزبون</th><th>الإجمالي</th><th>المدفوع</th><th>المتبقي</th></tr></thead>
    <tbody id="listRows"></tbody></table>`;
  renderSalesRows();
}
function renderSalesRows(){
  const q=(document.getElementById("listSearch")?.value||"").trim().toLowerCase();
  const rows=getSales().filter(s=>!q||s.number.toLowerCase().includes(q)||s.customerName.toLowerCase().includes(q)).slice().reverse();
  document.getElementById("listRows").innerHTML = rows.length? rows.map(s=>`<tr class="clickable" onclick="viewInvoice('sale','${s.id}')">
    <td>${s.number}</td><td>${s.date}</td><td>${escapeHtml(s.customerName)}</td><td>${fmt(s.total)}</td><td>${fmt(s.paid)}</td><td>${fmt(s.remaining)}</td></tr>`).join("")
    : `<tr><td colspan="6" class="empty">لا توجد فواتير بعد</td></tr>`;
}

function renderPurchases(){
  document.getElementById("module").innerHTML = `
    <div class="module-head"><h3>فواتير المشتريات</h3></div>
    <div class="module-actions">
      <input class="search" id="listSearch" placeholder="بحث برقم الفاتورة أو اسم المورد..." oninput="renderPurchasesRows()">
      <button class="primary" onclick="openInvoiceForm('purchase')">＋ فاتورة شراء جديدة</button>
    </div>
    <table class="module-table"><thead><tr><th>رقم الفاتورة</th><th>التاريخ</th><th>المورد</th><th>الإجمالي</th><th>المدفوع</th><th>المتبقي</th></tr></thead>
    <tbody id="listRows"></tbody></table>`;
  renderPurchasesRows();
}
function renderPurchasesRows(){
  const q=(document.getElementById("listSearch")?.value||"").trim().toLowerCase();
  const rows=getPurchases().filter(p=>!q||p.number.toLowerCase().includes(q)||p.supplierName.toLowerCase().includes(q)).slice().reverse();
  document.getElementById("listRows").innerHTML = rows.length? rows.map(p=>`<tr class="clickable" onclick="viewInvoice('purchase','${p.id}')">
    <td>${p.number}</td><td>${p.date}</td><td>${escapeHtml(p.supplierName)}</td><td>${fmt(p.total)}</td><td>${fmt(p.paid)}</td><td>${fmt(p.remaining)}</td></tr>`).join("")
    : `<tr><td colspan="6" class="empty">لا توجد فواتير بعد</td></tr>`;
}

function renderSalesReturns(){
  document.getElementById("module").innerHTML = `
    <div class="module-head"><h3>مردود المبيعات</h3></div>
    <div class="module-actions">
      <input class="search" id="listSearch" placeholder="بحث برقم المردود أو اسم الزبون..." oninput="renderSalesReturnsRows()">
      <button class="primary" onclick="openReturnForm('sale')">＋ مردود مبيعات جديد</button>
    </div>
    <table class="module-table"><thead><tr><th>رقم المردود</th><th>التاريخ</th><th>الزبون</th><th>مرجع الفاتورة</th><th>الإجمالي</th></tr></thead>
    <tbody id="listRows"></tbody></table>`;
  renderSalesReturnsRows();
}
function renderSalesReturnsRows(){
  const q=(document.getElementById("listSearch")?.value||"").trim().toLowerCase();
  const rows=getSalesReturns().filter(r=>!q||r.number.toLowerCase().includes(q)||(r.customerName||"").toLowerCase().includes(q)).slice().reverse();
  document.getElementById("listRows").innerHTML = rows.length? rows.map(r=>`<tr class="clickable" onclick="viewInvoice('saleReturn','${r.id}')">
    <td>${r.number}</td><td>${r.date}</td><td>${escapeHtml(r.customerName||"-")}</td><td>${escapeHtml(r.refNumber||"-")}</td><td>${fmt(r.total)}</td></tr>`).join("")
    : `<tr><td colspan="5" class="empty">لا توجد مردودات بعد</td></tr>`;
}

function renderPurchasesReturns(){
  document.getElementById("module").innerHTML = `
    <div class="module-head"><h3>مردود المشتريات</h3></div>
    <div class="module-actions">
      <input class="search" id="listSearch" placeholder="بحث برقم المردود أو اسم المورد..." oninput="renderPurchasesReturnsRows()">
      <button class="primary" onclick="openReturnForm('purchase')">＋ مردود مشتريات جديد</button>
    </div>
    <table class="module-table"><thead><tr><th>رقم المردود</th><th>التاريخ</th><th>المورد</th><th>مرجع الفاتورة</th><th>الإجمالي</th></tr></thead>
    <tbody id="listRows"></tbody></table>`;
  renderPurchasesReturnsRows();
}
function renderPurchasesReturnsRows(){
  const q=(document.getElementById("listSearch")?.value||"").trim().toLowerCase();
  const rows=getPurchasesReturns().filter(r=>!q||r.number.toLowerCase().includes(q)||(r.supplierName||"").toLowerCase().includes(q)).slice().reverse();
  document.getElementById("listRows").innerHTML = rows.length? rows.map(r=>`<tr class="clickable" onclick="viewInvoice('purchaseReturn','${r.id}')">
    <td>${r.number}</td><td>${r.date}</td><td>${escapeHtml(r.supplierName||"-")}</td><td>${escapeHtml(r.refNumber||"-")}</td><td>${fmt(r.total)}</td></tr>`).join("")
    : `<tr><td colspan="5" class="empty">لا توجد مردودات بعد</td></tr>`;
}

function allInvoicesCombined(){
  return [
    ...getSales().map(s=>({type:"sale",label:"بيع",number:s.number,date:s.date,party:s.customerName,total:s.total,id:s.id})),
    ...getSalesReturns().map(r=>({type:"saleReturn",label:"مردود بيع",number:r.number,date:r.date,party:r.customerName||"-",total:r.total,id:r.id})),
    ...getPurchases().map(p=>({type:"purchase",label:"شراء",number:p.number,date:p.date,party:p.supplierName,total:p.total,id:p.id})),
    ...getPurchasesReturns().map(r=>({type:"purchaseReturn",label:"مردود شراء",number:r.number,date:r.date,party:r.supplierName,total:r.total,id:r.id})),
  ].sort((a,b)=>b.date.localeCompare(a.date));
}
function renderInvoicesList(){
  document.getElementById("module").innerHTML = `
    <div class="module-head"><h3>قائمة الفواتير</h3></div>
    <div class="module-actions">
      <input class="search" id="listSearch" placeholder="بحث برقم الفاتورة أو اسم التاجر (الزبون/المورد)..." oninput="renderInvoicesListRows()">
    </div>
    <table class="module-table"><thead><tr><th>النوع</th><th>رقم الفاتورة</th><th>التاريخ</th><th>الطرف</th><th>الإجمالي</th></tr></thead>
    <tbody id="listRows"></tbody></table>`;
  renderInvoicesListRows();
}
function renderInvoicesListRows(){
  const q=(document.getElementById("listSearch")?.value||"").trim().toLowerCase();
  const rows=allInvoicesCombined().filter(x=>!q||x.number.toLowerCase().includes(q)||(x.party||"").toLowerCase().includes(q));
  document.getElementById("listRows").innerHTML = rows.length? rows.map(x=>`<tr class="clickable" onclick="viewInvoice('${x.type}','${x.id}')">
    <td>${x.label}</td><td>${x.number}</td><td>${x.date}</td><td>${escapeHtml(x.party)}</td><td>${fmt(x.total)}</td></tr>`).join("")
    : `<tr><td colspan="5" class="empty">لا توجد فواتير بعد</td></tr>`;
}

/* =========================================================
   المخزون والأصناف
   ========================================================= */
function renderInventory(){
  document.getElementById("module").innerHTML = `
    <div class="module-head"><h3>المخزون والأصناف</h3></div>
    <div class="module-actions">
      <input class="search" id="listSearch" placeholder="بحث بالاسم أو الباركود..." oninput="renderInventoryRows()">
      <button class="primary" onclick="openItemForm()">＋ إضافة صنف</button>
    </div>
    <table class="module-table"><thead><tr><th>الباركود</th><th>الاسم</th><th>الوحدة</th><th>سعر الشراء</th><th>سعر البيع</th><th>الكمية</th><th>الحد الأدنى</th><th></th></tr></thead>
    <tbody id="listRows"></tbody></table>`;
  renderInventoryRows();
}
function renderInventoryRows(){
  const q=(document.getElementById("listSearch")?.value||"").trim().toLowerCase();
  const rows=getItems().filter(i=>!q||i.name.toLowerCase().includes(q)||(i.barcode||"").toLowerCase().includes(q));
  document.getElementById("listRows").innerHTML = rows.length? rows.map(i=>`<tr class="${(Number(i.qty)||0)<=(Number(i.minQty)||0)?'low-stock':''}">
    <td>${escapeHtml(i.barcode||"-")}</td><td>${escapeHtml(i.name)}</td><td>${escapeHtml(i.unit)}</td>
    <td>${fmt(i.purchasePrice)}</td><td>${fmt(i.salePrice)}</td><td>${i.qty}</td><td>${i.minQty}</td>
    <td><button class="secondary" onclick="openItemForm('${i.id}')">تعديل</button></td></tr>`).join("")
    : `<tr><td colspan="8" class="empty">لا توجد أصناف بعد</td></tr>`;
}
function openItemForm(id){
  const item = id ? getItems().find(i=>i.id===id) : null;
  openModal(`<h2>${item?"تعديل صنف":"إضافة صنف جديد"}</h2>
    <label>اسم الصنف</label><input id="fName" value="${item?escapeHtml(item.name):""}" placeholder="اسم الصنف">
    <label>الباركود (اختياري)</label><input id="fBarcode" value="${item?escapeHtml(item.barcode||""):""}" placeholder="الباركود">
    <label>نوع الوحدة</label>
    <select id="fUnit">${UNITS.map(u=>`<option ${item&&item.unit===u?"selected":""}>${u}</option>`).join("")}</select>
    <label>سعر الشراء الأولي (قابل للتعديل لاحقاً)</label><input id="fPurchase" type="number" min="0" step="0.01" value="${item?item.purchasePrice:0}">
    <label>سعر البيع الأولي (قابل للتعديل لاحقاً)</label><input id="fSale" type="number" min="0" step="0.01" value="${item?item.salePrice:0}">
    <label>الكمية الحالية</label><input id="fQty" type="number" min="0" step="0.01" value="${item?item.qty:0}">
    <label>الحد الأدنى للتنبيه</label><input id="fMinQty" type="number" min="0" step="0.01" value="${item?item.minQty:5}">
    <button class="primary full" onclick="saveItemForm(${item?`'${item.id}'`:"null"})">حفظ الصنف</button>`);
}
function saveItemForm(id){
  const name=document.getElementById("fName").value.trim();
  if(!name){showToast("أدخل اسم الصنف");return}
  const data={
    barcode:document.getElementById("fBarcode").value.trim(),
    name, unit:document.getElementById("fUnit").value,
    purchasePrice:parseFloat(document.getElementById("fPurchase").value)||0,
    salePrice:parseFloat(document.getElementById("fSale").value)||0,
    qty:parseFloat(document.getElementById("fQty").value)||0,
    minQty:parseFloat(document.getElementById("fMinQty").value)||0
  };
  const items=getItems();
  if(id){ const it=items.find(i=>i.id===id); Object.assign(it,data); }
  else { items.push({id:uid(),...data}); }
  saveItems(items);
  showToast("تم حفظ الصنف بنجاح");
  closeModal();
  refreshCurrentView();
}
function quickAddItem(){ navigate("المخزون"); setTimeout(()=>openItemForm(), 60); }

/* =========================================================
   العملاء والموردون وكشوفات الحسابات
   ========================================================= */
function renderCustomers(){
  document.getElementById("module").innerHTML = `
    <div class="module-head"><h3>العملاء - كشوفات الحسابات</h3></div>
    <div class="module-actions">
      <input class="search" id="listSearch" placeholder="بحث باسم الزبون..." oninput="renderCustomersRows()">
      <button class="primary" onclick="openPartyForm('customer')">＋ إضافة عميل</button>
    </div>
    <table class="module-table"><thead><tr><th>اسم الزبون</th><th>الهاتف</th><th>الرصيد الحالي</th><th></th></tr></thead>
    <tbody id="listRows"></tbody></table>`;
  renderCustomersRows();
}
function renderCustomersRows(){
  const q=(document.getElementById("listSearch")?.value||"").trim().toLowerCase();
  const rows=getCustomers().filter(c=>!q||c.name.toLowerCase().includes(q));
  document.getElementById("listRows").innerHTML = rows.length? rows.map(c=>`<tr class="clickable" onclick="openCustomerStatement('${c.id}')">
    <td>${escapeHtml(c.name)}</td><td>${escapeHtml(c.phone||"-")}</td><td>${fmt(customerBalance(c.id))}</td>
    <td><button class="secondary" onclick="event.stopPropagation();openPartyForm('customer','${c.id}')">تعديل</button></td></tr>`).join("")
    : `<tr><td colspan="4" class="empty">لا يوجد عملاء بعد</td></tr>`;
}
function renderSuppliers(){
  document.getElementById("module").innerHTML = `
    <div class="module-head"><h3>الموردون - كشوفات الحسابات</h3></div>
    <div class="module-actions">
      <input class="search" id="listSearch" placeholder="بحث باسم المورد..." oninput="renderSuppliersRows()">
      <button class="primary" onclick="openPartyForm('supplier')">＋ إضافة مورد</button>
    </div>
    <table class="module-table"><thead><tr><th>اسم المورد</th><th>الهاتف</th><th>الرصيد الحالي</th><th></th></tr></thead>
    <tbody id="listRows"></tbody></table>`;
  renderSuppliersRows();
}
function renderSuppliersRows(){
  const q=(document.getElementById("listSearch")?.value||"").trim().toLowerCase();
  const rows=getSuppliers().filter(s=>!q||s.name.toLowerCase().includes(q));
  document.getElementById("listRows").innerHTML = rows.length? rows.map(s=>`<tr class="clickable" onclick="openSupplierStatement('${s.id}')">
    <td>${escapeHtml(s.name)}</td><td>${escapeHtml(s.phone||"-")}</td><td>${fmt(supplierBalance(s.id))}</td>
    <td><button class="secondary" onclick="event.stopPropagation();openPartyForm('supplier','${s.id}')">تعديل</button></td></tr>`).join("")
    : `<tr><td colspan="4" class="empty">لا يوجد موردون بعد</td></tr>`;
}
function openPartyForm(kind,id){
  const list = kind==="customer" ? getCustomers() : getSuppliers();
  const party = id ? list.find(x=>x.id===id) : null;
  openModal(`<h2>${party?"تعديل":"إضافة"} ${kind==="customer"?"عميل":"مورد"}</h2>
    <label>الاسم</label><input id="pName" value="${party?escapeHtml(party.name):""}">
    <label>الهاتف</label><input id="pPhone" value="${party?escapeHtml(party.phone||""):""}">
    <label>العنوان</label><input id="pAddress" value="${party?escapeHtml(party.address||""):""}">
    <label>الرصيد الافتتاحي</label><input id="pOpening" type="number" step="0.01" value="${party?party.openingBalance||0:0}">
    <button class="primary full" onclick="savePartyForm('${kind}'${party?`,'${party.id}'`:""})">حفظ</button>`);
}
function savePartyForm(kind,id){
  const name=document.getElementById("pName").value.trim();
  if(!name){showToast("أدخل الاسم");return}
  const data={name, phone:document.getElementById("pPhone").value.trim(),
    address:document.getElementById("pAddress").value.trim(),
    openingBalance:parseFloat(document.getElementById("pOpening").value)||0};
  if(kind==="customer"){
    const list=getCustomers();
    if(id){Object.assign(list.find(x=>x.id===id),data)} else {list.push({id:uid(),...data})}
    saveCustomers(list);
  } else {
    const list=getSuppliers();
    if(id){Object.assign(list.find(x=>x.id===id),data)} else {list.push({id:uid(),...data})}
    saveSuppliers(list);
  }
  showToast("تم الحفظ بنجاح"); closeModal(); refreshCurrentView();
}
function quickAddCustomer(){ navigate("العملاء"); setTimeout(()=>openPartyForm("customer"), 60); }
function quickAddSupplier(){ navigate("الموردون"); setTimeout(()=>openPartyForm("supplier"), 60); }

function openCustomerStatement(id){
  const c=getCustomers().find(x=>x.id===id); if(!c){showToast("لم يتم العثور على الزبون");return}
  let entries=[];
  getSales().filter(s=>s.customerId===id).forEach(s=>entries.push({date:s.date,desc:"فاتورة بيع "+s.number,debit:s.total,credit:s.paid,ref:{type:"sale",id:s.id}}));
  getSalesReturns().filter(r=>r.customerId===id).forEach(r=>entries.push({date:r.date,desc:"مردود مبيعات "+r.number,debit:0,credit:r.total,ref:{type:"saleReturn",id:r.id}}));
  getVouchers().filter(v=>v.partyType==="customer"&&v.partyId===id).forEach(v=>entries.push({date:v.date,desc:(v.type==="receipt"?"سند قبض ":"سند صرف ")+v.number,debit:v.type==="payment"?v.amount:0,credit:v.type==="receipt"?v.amount:0,ref:null}));
  entries.sort((a,b)=>a.date.localeCompare(b.date));
  let bal=Number(c.openingBalance)||0;
  const rowsHtml = entries.map(e=>{ bal += e.debit-e.credit;
    return `<tr class="${e.ref?"clickable":""}" ${e.ref?`onclick="viewInvoice('${e.ref.type}','${e.ref.id}')"`:""}><td>${e.date}</td><td>${escapeHtml(e.desc)}</td><td>${e.debit?fmt(e.debit):"-"}</td><td>${e.credit?fmt(e.credit):"-"}</td><td>${fmt(bal)}</td></tr>`;
  }).join("");
  openModal(`<h2>كشف حساب: ${escapeHtml(c.name)}</h2>
   <p class="muted">الهاتف: ${escapeHtml(c.phone||"-")} — الرصيد الافتتاحي: ${fmt(c.openingBalance||0)}</p>
   <table class="module-table"><thead><tr><th>التاريخ</th><th>البيان</th><th>مدين</th><th>دائن</th><th>الرصيد</th></tr></thead>
   <tbody>${rowsHtml||'<tr><td colspan="5" class="empty">لا توجد حركات بعد</td></tr>'}</tbody></table>
   <div class="inv-summary"><div><span>الرصيد الحالي</span><b>${fmt(bal)}</b></div></div>
   <button class="primary full" onclick="window.print()">🖨 طباعة كشف الحساب</button>`);
}
function openSupplierStatement(id){
  const s=getSuppliers().find(x=>x.id===id); if(!s){showToast("لم يتم العثور على المورد");return}
  let entries=[];
  getPurchases().filter(p=>p.supplierId===id).forEach(p=>entries.push({date:p.date,desc:"فاتورة شراء "+p.number,debit:p.paid,credit:p.total,ref:{type:"purchase",id:p.id}}));
  getPurchasesReturns().filter(r=>r.supplierId===id).forEach(r=>entries.push({date:r.date,desc:"مردود مشتريات "+r.number,debit:r.total,credit:0,ref:{type:"purchaseReturn",id:r.id}}));
  getVouchers().filter(v=>v.partyType==="supplier"&&v.partyId===id).forEach(v=>entries.push({date:v.date,desc:(v.type==="payment"?"سند صرف ":"سند قبض ")+v.number,debit:v.type==="payment"?v.amount:0,credit:v.type==="receipt"?v.amount:0,ref:null}));
  entries.sort((a,b)=>a.date.localeCompare(b.date));
  let bal=Number(s.openingBalance)||0;
  const rowsHtml = entries.map(e=>{ bal += e.credit-e.debit;
    return `<tr class="${e.ref?"clickable":""}" ${e.ref?`onclick="viewInvoice('${e.ref.type}','${e.ref.id}')"`:""}><td>${e.date}</td><td>${escapeHtml(e.desc)}</td><td>${e.debit?fmt(e.debit):"-"}</td><td>${e.credit?fmt(e.credit):"-"}</td><td>${fmt(bal)}</td></tr>`;
  }).join("");
  openModal(`<h2>كشف حساب: ${escapeHtml(s.name)}</h2>
   <p class="muted">الهاتف: ${escapeHtml(s.phone||"-")} — الرصيد الافتتاحي: ${fmt(s.openingBalance||0)} (مدين = دفعت له، دائن = عليك له)</p>
   <table class="module-table"><thead><tr><th>التاريخ</th><th>البيان</th><th>مدين (دفعت)</th><th>دائن (عليك)</th><th>الرصيد المستحق له</th></tr></thead>
   <tbody>${rowsHtml||'<tr><td colspan="5" class="empty">لا توجد حركات بعد</td></tr>'}</tbody></table>
   <div class="inv-summary"><div><span>المستحق له حالياً</span><b>${fmt(bal)}</b></div></div>
   <button class="primary full" onclick="window.print()">🖨 طباعة كشف الحساب</button>`);
}

/* =========================================================
   الصندوق والبنوك (سندات القبض والصرف)
   ========================================================= */
function renderCash(){
  document.getElementById("module").innerHTML = `
    <h3>الصندوق والبنوك</h3>
    <div class="cards mini">
      <div class="card blue"><span>💵</span><p>رصيد الصندوق</p><strong>${fmt(cashBalance())}</strong></div>
      <div class="card green"><span>🏦</span><p>رصيد البنك</p><strong>${fmt(bankBalance())}</strong></div>
    </div>
    <div class="module-actions">
      <button class="primary" onclick="openVoucherForm('receipt')">＋ سند قبض</button>
      <button class="primary" onclick="openVoucherForm('payment')">＋ سند صرف</button>
    </div>
    <table class="module-table"><thead><tr><th>الرقم</th><th>النوع</th><th>التاريخ</th><th>الحساب</th><th>الجهة</th><th>المبلغ</th><th>ملاحظة</th></tr></thead>
    <tbody>${getVouchers().slice().reverse().map(v=>`<tr><td>${v.number}</td><td>${v.type==="receipt"?"قبض":"صرف"}</td><td>${v.date}</td><td>${v.account==="cash"?"الصندوق":"البنك"}</td><td>${escapeHtml(v.partyName||"-")}</td><td>${fmt(v.amount)}</td><td>${escapeHtml(v.note||"")}</td></tr>`).join("")||'<tr><td colspan="7" class="empty">لا توجد سندات بعد</td></tr>'}</tbody></table>`;
}
function openVoucherForm(type){
  window._custOpts=getCustomers().map(c=>`<option value="${escapeHtml(c.name)}">`).join("");
  window._suppOpts=getSuppliers().map(s=>`<option value="${escapeHtml(s.name)}">`).join("");
  openModal(`<h2>${type==="receipt"?"سند قبض":"سند صرف"}</h2>
  <label>الحساب</label><select id="vAccount"><option value="cash">الصندوق</option><option value="bank">البنك</option></select>
  <label>نوع الجهة</label><select id="vPartyType" onchange="togglePartyList()"><option value="other">أخرى</option><option value="customer">زبون</option><option value="supplier">مورد</option></select>
  <label>اسم الجهة</label><input id="vPartyName" list="vPartyList" placeholder="اسم الجهة (اختياري)">
  <datalist id="vPartyList"></datalist>
  <label>المبلغ</label><input id="vAmount" type="number" min="0" step="0.01" value="0">
  <label>ملاحظة</label><input id="vNote" placeholder="ملاحظة">
  <button class="primary full" onclick="saveVoucher('${type}')">حفظ السند</button>`);
}
function togglePartyList(){
  const t=document.getElementById("vPartyType").value;
  document.getElementById("vPartyList").innerHTML = t==="customer"?window._custOpts:t==="supplier"?window._suppOpts:"";
}
function saveVoucher(type){
  const account=document.getElementById("vAccount").value;
  const partyType=document.getElementById("vPartyType").value;
  const partyName=document.getElementById("vPartyName").value.trim();
  const amount=parseFloat(document.getElementById("vAmount").value)||0;
  const note=document.getElementById("vNote").value.trim();
  if(amount<=0){showToast("أدخل مبلغاً صحيحاً");return}
  let partyId=null;
  if(partyType==="customer"){const c=getCustomers().find(x=>x.name===partyName); partyId=c?c.id:null;}
  if(partyType==="supplier"){const s=getSuppliers().find(x=>x.name===partyName); partyId=s?s.id:null;}
  const v={id:uid(),number:nextNumber(type==="receipt"?"RC-":"PM-", type==="receipt"?"receipts":"payments"),
    type,date:todayISO(),account,partyType,partyId,partyName:partyName||"-",amount,note};
  const list=getVouchers(); list.push(v); saveVouchers(list);
  showToast("تم حفظ السند رقم "+v.number);
  closeModal(); refreshCurrentView();
}

/* =========================================================
   المصروفات
   ========================================================= */
function renderExpenses(){
  document.getElementById("module").innerHTML = `
    <h3>المصروفات</h3>
    <div class="module-actions"><button class="primary" onclick="openExpenseForm()">＋ مصروف جديد</button></div>
    <table class="module-table"><thead><tr><th>الرقم</th><th>التاريخ</th><th>التصنيف</th><th>البيان</th><th>المبلغ</th></tr></thead>
    <tbody>${getExpenses().slice().reverse().map(e=>`<tr><td>${e.number}</td><td>${e.date}</td><td>${escapeHtml(e.category)}</td><td>${escapeHtml(e.note||"-")}</td><td>${fmt(e.amount)}</td></tr>`).join("")||'<tr><td colspan="5" class="empty">لا توجد مصروفات بعد</td></tr>'}</tbody></table>`;
}
function openExpenseForm(){
  openModal(`<h2>مصروف جديد</h2>
  <label>التصنيف</label><select id="eCategory">${EXPENSE_CATEGORIES.map(c=>`<option>${c}</option>`).join("")}</select>
  <label>البيان</label><input id="eNote" placeholder="وصف المصروف">
  <label>المبلغ</label><input id="eAmount" type="number" min="0" step="0.01" value="0">
  <button class="primary full" onclick="saveExpense()">حفظ</button>`);
}
function saveExpense(){
  const category=document.getElementById("eCategory").value;
  const note=document.getElementById("eNote").value.trim();
  const amount=parseFloat(document.getElementById("eAmount").value)||0;
  if(amount<=0){showToast("أدخل مبلغاً صحيحاً");return}
  const e={id:uid(),number:nextNumber("EX-","expenses"),date:todayISO(),category,note,amount};
  const list=getExpenses(); list.push(e); saveExpenses(list);
  showToast("تم تسجيل المصروف"); closeModal(); refreshCurrentView();
}

/* =========================================================
   الحسابات (أرصدة عامة) والمحاسبة (دفتر اليومية)
   ========================================================= */
function renderAccounts(){
  document.getElementById("module").innerHTML = `
    <h3>أرصدة الحسابات</h3>
    <div class="cards mini">
      <div class="card blue"><span>💵</span><p>الصندوق</p><strong>${fmt(cashBalance())}</strong></div>
      <div class="card green"><span>🏦</span><p>البنك</p><strong>${fmt(bankBalance())}</strong></div>
      <div class="card orange"><span>👤</span><p>عملاء (مدينون)</p><strong>${fmt(totalReceivable())}</strong></div>
      <div class="card red"><span>👥</span><p>موردون (دائنون)</p><strong>${fmt(totalPayable())}</strong></div>
    </div>
    <div class="panel-title"><h3>تفصيل أرصدة العملاء</h3></div>
    <table class="module-table"><thead><tr><th>الزبون</th><th>الرصيد</th></tr></thead>
    <tbody>${getCustomers().map(c=>`<tr class="clickable" onclick="openCustomerStatement('${c.id}')"><td>${escapeHtml(c.name)}</td><td>${fmt(customerBalance(c.id))}</td></tr>`).join("")||'<tr><td colspan="2" class="empty">لا يوجد عملاء</td></tr>'}</tbody></table>
    <div class="panel-title"><h3>تفصيل أرصدة الموردين</h3></div>
    <table class="module-table"><thead><tr><th>المورد</th><th>الرصيد</th></tr></thead>
    <tbody>${getSuppliers().map(s=>`<tr class="clickable" onclick="openSupplierStatement('${s.id}')"><td>${escapeHtml(s.name)}</td><td>${fmt(supplierBalance(s.id))}</td></tr>`).join("")||'<tr><td colspan="2" class="empty">لا يوجد موردون</td></tr>'}</tbody></table>`;
}
function renderAccounting(){
  let entries=[];
  getSales().forEach(s=>entries.push({date:s.date,desc:"فاتورة بيع "+s.number,debit:"الصندوق/العملاء",credit:"المبيعات",amount:s.total}));
  getPurchases().forEach(p=>entries.push({date:p.date,desc:"فاتورة شراء "+p.number,debit:"المشتريات",credit:"الصندوق/الموردون",amount:p.total}));
  getSalesReturns().forEach(r=>entries.push({date:r.date,desc:"مردود مبيعات "+r.number,debit:"مردودات المبيعات",credit:"العملاء",amount:r.total}));
  getPurchasesReturns().forEach(r=>entries.push({date:r.date,desc:"مردود مشتريات "+r.number,debit:"الموردون",credit:"مردودات المشتريات",amount:r.total}));
  getExpenses().forEach(e=>entries.push({date:e.date,desc:"مصروف: "+e.category,debit:"المصروفات",credit:"الصندوق",amount:e.amount}));
  getVouchers().forEach(v=>entries.push({date:v.date,desc:(v.type==="receipt"?"سند قبض ":"سند صرف ")+v.number,
    debit:v.type==="receipt"?(v.account==="cash"?"الصندوق":"البنك"):(v.partyName||"الجهة"),
    credit:v.type==="receipt"?(v.partyName||"الجهة"):(v.account==="cash"?"الصندوق":"البنك"),amount:v.amount}));
  entries.sort((a,b)=>a.date.localeCompare(b.date));
  document.getElementById("module").innerHTML = `
    <h3>دفتر اليومية (القيود المحاسبية)</h3>
    <table class="module-table"><thead><tr><th>التاريخ</th><th>البيان</th><th>من حساب (مدين)</th><th>إلى حساب (دائن)</th><th>المبلغ</th></tr></thead>
    <tbody>${entries.map(e=>`<tr><td>${e.date}</td><td>${escapeHtml(e.desc)}</td><td>${escapeHtml(e.debit)}</td><td>${escapeHtml(e.credit)}</td><td>${fmt(e.amount)}</td></tr>`).join("")||'<tr><td colspan="5" class="empty">لا توجد قيود بعد</td></tr>'}</tbody></table>
    <button class="primary" onclick="window.print()">🖨 طباعة</button>`;
}

/* =========================================================
   التقارير
   ========================================================= */
function renderReports(){
  document.getElementById("module").innerHTML = `
    <h3>التقارير</h3>
    <div class="module-actions">
      <label style="margin:0">من</label><input type="date" id="repFrom">
      <label style="margin:0">إلى</label><input type="date" id="repTo">
      <select id="repType">
        <option value="sales">تقرير المبيعات</option>
        <option value="purchases">تقرير المشتريات</option>
        <option value="inventory">تقرير المخزون</option>
        <option value="profit">تقرير الأرباح</option>
      </select>
      <button class="primary" onclick="runReport()">عرض التقرير</button>
      <button class="secondary" onclick="window.print()">🖨 طباعة</button>
    </div>
    <div id="reportOutput" class="printable"></div>`;
  runReport();
}
function runReport(){
  const type=document.getElementById("repType").value;
  const from=document.getElementById("repFrom").value, to=document.getElementById("repTo").value;
  const out=document.getElementById("reportOutput");
  if(type==="sales"){
    const rows=getSales().filter(s=>inRange(s.date,from,to));
    const total=rows.reduce((a,r)=>a+r.total,0);
    out.innerHTML=`<table class="module-table"><thead><tr><th>الرقم</th><th>التاريخ</th><th>الزبون</th><th>الإجمالي</th></tr></thead>
    <tbody>${rows.map(r=>`<tr><td>${r.number}</td><td>${r.date}</td><td>${escapeHtml(r.customerName)}</td><td>${fmt(r.total)}</td></tr>`).join("")||'<tr><td colspan="4" class="empty">لا نتائج</td></tr>'}</tbody></table>
    <div class="inv-summary"><div><span>إجمالي المبيعات</span><b>${fmt(total)}</b></div></div>`;
  } else if(type==="purchases"){
    const rows=getPurchases().filter(p=>inRange(p.date,from,to));
    const total=rows.reduce((a,r)=>a+r.total,0);
    out.innerHTML=`<table class="module-table"><thead><tr><th>الرقم</th><th>التاريخ</th><th>المورد</th><th>الإجمالي</th></tr></thead>
    <tbody>${rows.map(r=>`<tr><td>${r.number}</td><td>${r.date}</td><td>${escapeHtml(r.supplierName)}</td><td>${fmt(r.total)}</td></tr>`).join("")||'<tr><td colspan="4" class="empty">لا نتائج</td></tr>'}</tbody></table>
    <div class="inv-summary"><div><span>إجمالي المشتريات</span><b>${fmt(total)}</b></div></div>`;
  } else if(type==="inventory"){
    const items=getItems();
    out.innerHTML=`<table class="module-table"><thead><tr><th>الصنف</th><th>الوحدة</th><th>الكمية</th><th>سعر الشراء</th><th>القيمة</th></tr></thead>
    <tbody>${items.map(i=>`<tr class="${(Number(i.qty)||0)<=(Number(i.minQty)||0)?'low-stock':''}"><td>${escapeHtml(i.name)}</td><td>${escapeHtml(i.unit)}</td><td>${i.qty}</td><td>${fmt(i.purchasePrice)}</td><td>${fmt((i.qty||0)*(i.purchasePrice||0))}</td></tr>`).join("")||'<tr><td colspan="5" class="empty">لا توجد أصناف</td></tr>'}</tbody></table>
    <div class="inv-summary"><div><span>إجمالي قيمة المخزون</span><b>${fmt(stockValue())}</b></div></div>`;
  } else if(type==="profit"){
    const sales=getSales().filter(s=>inRange(s.date,from,to)).reduce((a,r)=>a+r.total,0);
    const purchases=getPurchases().filter(p=>inRange(p.date,from,to)).reduce((a,r)=>a+r.total,0);
    const expenses=getExpenses().filter(e=>inRange(e.date,from,to)).reduce((a,r)=>a+r.amount,0);
    const salesReturns=getSalesReturns().filter(r=>inRange(r.date,from,to)).reduce((a,r)=>a+r.total,0);
    const profit = sales - salesReturns - purchases - expenses;
    out.innerHTML=`<div class="inv-summary col">
      <div><span>إجمالي المبيعات</span><b>${fmt(sales)}</b></div>
      <div><span>مردودات المبيعات</span><b>${fmt(salesReturns)}</b></div>
      <div><span>إجمالي المشتريات</span><b>${fmt(purchases)}</b></div>
      <div><span>المصروفات</span><b>${fmt(expenses)}</b></div>
      <div><span>صافي الربح التقديري</span><b class="${profit<0?'neg':'pos'}">${fmt(profit)}</b></div>
    </div>`;
  }
}

/* =========================================================
   الإعدادات
   ========================================================= */
function renderSettings(){
  const s=getSettings();
  document.getElementById("module").innerHTML = `
    <h3>الإعدادات</h3>
    <label>اسم المحل</label><input id="setStoreName" value="${escapeHtml(s.storeName)}">
    <label>العنوان</label><input id="setAddress" value="${escapeHtml(s.address||"")}">
    <label>رمز العملة</label><input id="setCurrency" value="${escapeHtml(s.currency)}">
    <label>الرصيد الافتتاحي للصندوق</label><input id="setOpeningCash" type="number" step="0.01" value="${s.openingCash||0}">
    <label>الرصيد الافتتاحي للبنك</label><input id="setOpeningBank" type="number" step="0.01" value="${s.openingBank||0}">
    <button class="primary" onclick="saveSettingsForm()" style="margin-top:15px">حفظ الإعدادات</button>
    <hr style="margin:22px 0;border:0;border-top:1px solid #eef1f5">
    <h3>تغيير كلمة المرور</h3>
    <label>كلمة المرور الجديدة</label><input id="newOwnPassword" type="password" placeholder="4 أحرف على الأقل">
    <button class="primary" onclick="changeOwnPassword()" style="margin-top:10px">تغيير كلمة المرور</button>`;
}
function saveSettingsForm(){
  setSettings({
    storeName:document.getElementById("setStoreName").value.trim()||"متجرك التجاري",
    address:document.getElementById("setAddress").value.trim(),
    currency:document.getElementById("setCurrency").value.trim()||"₪",
    openingCash:parseFloat(document.getElementById("setOpeningCash").value)||0,
    openingBank:parseFloat(document.getElementById("setOpeningBank").value)||0
  });
  showToast("تم حفظ الإعدادات");
  refreshBrand();
}
async function changeOwnPassword(){
  const pass=document.getElementById("newOwnPassword").value;
  if(!pass||pass.length<4){showToast("كلمة المرور قصيرة جداً");return}
  const users=getUsers(); const cur=getCurrentUser();
  const u=users.find(x=>x.id===cur.id);
  u.passwordHash=await hashPassword(pass);
  localStorage.setItem("erp_users",JSON.stringify(users));
  showToast("تم تغيير كلمة المرور بنجاح");
  document.getElementById("newOwnPassword").value="";
}
function refreshBrand(){
  const s=getSettings();
  const el=document.getElementById("brandTitle");
  if(el) el.textContent = s.storeName || "نظام المحاسبة وإدارة المحل التجاري";
  const foot=document.getElementById("sideFooter");
  if(foot) foot.innerHTML = escapeHtml(s.storeName||"متجرك")+" • بإدارة أفضل<br><small>الإصدار 2.0.0</small>";
}

/* =========================================================
   النسخ الاحتياطي
   ========================================================= */
function renderBackup(){
  document.getElementById("module").innerHTML = `
    <h3>النسخ الاحتياطي</h3>
    <p class="muted">يتم حفظ جميع البيانات تلقائياً في متصفحك (localStorage). يمكنك تصدير نسخة احتياطية أو استعادتها في أي وقت.</p>
    <div class="module-actions">
      <button class="primary" onclick="exportBackup()">⬇️ تصدير نسخة احتياطية (JSON)</button>
      <label class="primary" style="cursor:pointer">⬆️ استيراد نسخة احتياطية<input type="file" accept="application/json" style="display:none" onchange="importBackup(this.files[0])"></label>
      <button class="danger" onclick="deleteAllData()">🗑 حذف جميع البيانات</button>
    </div>`;
}
function exportBackup(){
  const data={}; DATA_KEYS.forEach(k=>data[k]=localStorage.getItem(k));
  const blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"});
  const a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download="نسخة-احتياطية-"+todayISO()+".json"; a.click();
  showToast("تم تصدير النسخة الاحتياطية");
}
function importBackup(file){
  if(!file)return;
  const reader=new FileReader();
  reader.onload=()=>{
    try{
      const data=JSON.parse(reader.result);
      DATA_KEYS.forEach(k=>{ if(data[k]!==undefined) localStorage.setItem(k,data[k]); });
      showToast("تم استيراد البيانات، سيتم إعادة تحميل الصفحة");
      setTimeout(()=>location.reload(),1200);
    }catch(e){showToast("ملف غير صالح")}
  };
  reader.readAsText(file);
}
function deleteAllData(){
  if(!confirm("سيتم حذف جميع البيانات (المبيعات، المشتريات، المخزون...) نهائياً. هل أنت متأكد؟"))return;
  DATA_KEYS.filter(k=>k!=="erp_users").forEach(k=>localStorage.removeItem(k));
  showToast("تم حذف جميع البيانات");
  setTimeout(()=>location.reload(),1000);
}

/* =========================================================
   التنقل بين الصفحات (Router)
   ========================================================= */
const RENDERERS = {
  "المبيعات": renderSales,
  "مردود المبيعات": renderSalesReturns,
  "المشتريات": renderPurchases,
  "مردود المشتريات": renderPurchasesReturns,
  "المخزون": renderInventory,
  "قائمة الفواتير": renderInvoicesList,
  "العملاء": renderCustomers,
  "الموردون": renderSuppliers,
  "الصندوق والبنوك": renderCash,
  "المصروفات": renderExpenses,
  "الحسابات": renderAccounts,
  "المحاسبة": renderAccounting,
  "التقارير": renderReports,
  "النسخ الاحتياطي": renderBackup,
  "الإعدادات": renderSettings
};
let currentModuleName = "الرئيسية";
function navigate(name, el){
  if(name==="المستخدمون والصلاحيات"){ showUsersManager(); return; }
  const key=nameToKey[name];
  if(key && !hasPermission(key)){ showToast("ليس لديك صلاحية للوصول إلى هذه الشاشة"); return; }
  document.querySelectorAll(".nav").forEach(x=>x.classList.remove("active"));
  if(el) el.classList.add("active");
  currentModuleName = name;
  const dashboard=document.getElementById("dashboard"), module=document.getElementById("module");
  document.getElementById("pageTitle").textContent = name==="الرئيسية" ? "لوحة التحكم" : name;
  if(name==="الرئيسية"){ dashboard.classList.remove("hidden"); module.classList.add("hidden"); refreshDashboard(); return; }
  dashboard.classList.add("hidden"); module.classList.remove("hidden");
  const fn=RENDERERS[name];
  if(fn) fn(); else module.innerHTML = `<h3>${escapeHtml(name)}</h3><p class="muted">قريباً</p>`;
}
function refreshCurrentView(){
  if(currentModuleName==="الرئيسية"){ refreshDashboard(); return; }
  const fn=RENDERERS[currentModuleName];
  if(fn) fn();
}

/* =========================================================
   لوحة التحكم
   ========================================================= */
function refreshDashboard(){
  const items=getItems();
  document.getElementById("stockValue").textContent=fmt(stockValue());
  document.getElementById("itemCountLabel").textContent="عدد الأصناف: "+items.length;
  document.getElementById("totalSalesValue").textContent=fmt(getSales().reduce((a,s)=>a+s.total,0));
  document.getElementById("totalPurchasesValue").textContent=fmt(getPurchases().reduce((a,p)=>a+p.total,0));
  const sales=getSales().reduce((a,s)=>a+s.total,0);
  const purchases=getPurchases().reduce((a,p)=>a+p.total,0);
  const expenses=getExpenses().reduce((a,e)=>a+e.amount,0);
  document.getElementById("netProfitValue").textContent=fmt(sales-purchases-expenses);

  document.getElementById("balCash").textContent=fmt(cashBalance());
  document.getElementById("balBank").textContent=fmt(bankBalance());
  document.getElementById("balReceivable").textContent=fmt(totalReceivable());
  document.getElementById("balPayable").textContent=fmt(totalPayable());

  const available=items.filter(i=>(Number(i.qty)||0)>(Number(i.minQty)||0)).length;
  const low=items.filter(i=>(Number(i.qty)||0)>0 && (Number(i.qty)||0)<=(Number(i.minQty)||0)).length;
  const out=items.filter(i=>(Number(i.qty)||0)<=0).length;
  document.getElementById("stAvailable").textContent=available;
  document.getElementById("stLow").textContent=low;
  document.getElementById("stOut").textContent=out;
  document.getElementById("stTotal").textContent=items.length;

  // أكثر الأصناف مبيعاً
  const soldMap={};
  getSales().forEach(s=>s.items.forEach(l=>{
    if(!soldMap[l.itemId]) soldMap[l.itemId]={name:l.name,qty:0,total:0};
    soldMap[l.itemId].qty+=Number(l.qty)||0; soldMap[l.itemId].total+=Number(l.total)||0;
  }));
  const top=Object.values(soldMap).sort((a,b)=>b.qty-a.qty).slice(0,5);
  document.getElementById("topItemsBody").innerHTML = top.length ? top.map((t,i)=>
    `<div class="tr"><span>${i+1}</span><span>${escapeHtml(t.name)}</span><span>${t.qty}</span><span>${fmt(t.total)}</span></div>`).join("")
    : `<div class="tr"><span style="color:#95a5b8">لا توجد مبيعات بعد</span></div>`;

  // التنبيهات
  const unpaidPurchases=getPurchases().filter(p=>p.remaining>0).length;
  const overdueCustomers=getCustomers().filter(c=>customerBalance(c.id)>0).length;
  const overdueSales=getSales().filter(s=>s.remaining>0).length;
  let alerts=[];
  if(low>0) alerts.push(`⚠️ يوجد ${low} صنف بمخزون أقل من الحد الأدنى <a onclick="navigate('المخزون')">عرض التفاصيل</a>`);
  if(out>0) alerts.push(`⛔ يوجد ${out} صنف نافذ من المخزون <a onclick="navigate('المخزون')">عرض التفاصيل</a>`);
  if(unpaidPurchases>0) alerts.push(`🕘 توجد ${unpaidPurchases} فاتورة مشتريات لم تُدفع بالكامل <a onclick="navigate('المشتريات')">عرض التفاصيل</a>`);
  if(overdueCustomers>0) alerts.push(`❗ يوجد ${overdueCustomers} عميل لديه رصيد مستحق <a onclick="navigate('العملاء')">عرض التفاصيل</a>`);
  if(overdueSales>0) alerts.push(`📄 توجد ${overdueSales} فاتورة بيع آجلة (لم تُحصّل بالكامل) <a onclick="navigate('المبيعات')">عرض التفاصيل</a>`);
  document.getElementById("alertsBody").innerHTML = alerts.length
    ? alerts.map(a=>`<div class="alert">${a}</div>`).join("")
    : `<div class="alert">✅ لا توجد تنبيهات حالياً</div>`;
  document.getElementById("notifCount").textContent = low+out+unpaidPurchases+overdueCustomers;

  drawChart();
}

/* =========================================================
   واجهة عامة: Toast والساعة
   ========================================================= */
function showToast(msg){
  const t=document.getElementById("toast");
  t.textContent=msg; t.style.display="block";
  clearTimeout(window.toastTimer);
  window.toastTimer=setTimeout(()=>t.style.display="none",2500);
}
function updateClock(){
  const now=new Date();
  document.getElementById("clock").textContent=now.toLocaleTimeString("ar-PS",{hour:"2-digit",minute:"2-digit"});
  document.getElementById("topDate").textContent=now.toLocaleDateString("ar-PS",{year:"numeric",month:"long",day:"numeric"});
}
setInterval(updateClock,1000);updateClock();

/* =========================================================
   الرسم البياني (مبيعات/مشتريات آخر 7 أيام)
   ========================================================= */
const canvas=document.getElementById("salesChart"), ctx=canvas.getContext("2d");
function last7Dates(){
  const arr=[];
  for(let i=6;i>=0;i--){ const d=new Date(); d.setDate(d.getDate()-i); arr.push(d.toISOString().slice(0,10)); }
  return arr;
}
function drawChart(){
  const w=canvas.clientWidth||canvas.parentElement.clientWidth||600, h=220, dpr=devicePixelRatio||1;
  canvas.width=w*dpr; canvas.height=h*dpr; ctx.setTransform(1,0,0,1,0,0); ctx.scale(dpr,dpr);
  ctx.clearRect(0,0,w,h); ctx.strokeStyle="#e6edf4"; ctx.lineWidth=1;
  for(let y=20;y<h;y+=40){ctx.beginPath();ctx.moveTo(30,y);ctx.lineTo(w-10,y);ctx.stroke()}

  const dates=last7Dates();
  const sales=dates.map(d=>getSales().filter(s=>s.date===d).reduce((a,s)=>a+s.total,0));
  const purchases=dates.map(d=>getPurchases().filter(p=>p.date===d).reduce((a,p)=>a+p.total,0));
  const max=Math.max(1000, ...sales, ...purchases) * 1.15;

  function line(data,color){
    ctx.strokeStyle=color; ctx.lineWidth=3; ctx.beginPath();
    data.forEach((v,i)=>{ const x=35+i*(w-55)/(data.length-1||1), y=h-20-(v/max)*(h-45); i?ctx.lineTo(x,y):ctx.moveTo(x,y); });
    ctx.stroke();
  }
  line(sales,"#1677df"); line(purchases,"#f0642d");
}

/* =========================================================
   التهيئة عند بدء التشغيل
   ========================================================= */
ensureAdmin().then(()=>{
  const u=getCurrentUser();
  if(u){
    document.getElementById("loginScreen").style.display="none";
    applyPermissions();
    refreshBrand();
    refreshDashboard();
  } else {
    document.getElementById("loginScreen").style.display="flex";
    refreshBrand();
  }
});
window.addEventListener("resize",()=>{ if(currentModuleName==="الرئيسية") drawChart(); });
