const express=require('express'),crypto=require('crypto'),Database=require('better-sqlite3');
const {BOT_TOKEN,PAY_TOKEN,WEBAPP_URL,WEBHOOK_SECRET:SECRET,ADMIN_IDS='',PORT=3000}=process.env;
const ADMINS=ADMIN_IDS.split(',').map(Number),BID=1000,STEP=100,SEC=15;
const now=()=>Math.floor(Date.now()/1e3);
const db=new Database('data.db');db.pragma('journal_mode=WAL');
db.exec(`create table if not exists users(id integer primary key,name text,bal integer default 0);
create table if not exists tx(id integer primary key autoincrement,uid integer,amt integer,kind text,ref text,at integer default(strftime('%s','now')));
create unique index if not exists tx_ref on tx(ref);
create table if not exists auctions(id integer primary key autoincrement,title text,emoji text,value integer,price integer default 1000,end_at integer,leader integer,leader_name text,status text default 'live');
create table if not exists lots(id integer primary key autoincrement,title text,emoji text,price integer,slots integer default 100,status text default 'open',winner integer,winner_slot integer);
create table if not exists tickets(lot integer,slot integer,uid integer,primary key(lot,slot));`);
const tg=(m,b)=>fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${m}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(b)}).then(r=>r.json()).catch(()=>({}));
const say=(id,text)=>tg('sendMessage',{chat_id:id,text});
const app=express();app.use(express.json());app.use(express.static('public'));

// Telegram initData imzosini tekshirish
function auth(q,r,next){const p=new URLSearchParams(q.get('x-init')||'');const h=p.get('hash');p.delete('hash');
 const s=[...p].map(([k,v])=>k+'='+v).sort().join('\n');
 const key=crypto.createHmac('sha256','WebAppData').update(BOT_TOKEN).digest();
 if(!h||crypto.createHmac('sha256',key).update(s).digest('hex')!==h||now()-p.get('auth_date')>86400)return r.sendStatus(401);
 const u=JSON.parse(p.get('user'));
 db.prepare('insert into users(id,name) values(?,?) on conflict(id) do update set name=excluded.name').run(u.id,u.first_name);
 q.uid=u.id;q.name=u.first_name;next()}
const guard=fn=>(q,r)=>{try{r.json(fn(q))}catch(e){r.status(400).json({err:typeof e==='string'?e:'Xatolik'});if(typeof e!=='string')console.error(e)}};
const charge=(uid,amt,kind)=>{if(db.prepare('update users set bal=bal-? where id=? and bal>=?').run(amt,uid,amt).changes==0)throw 'Balans yetarli emas';
 db.prepare('insert into tx(uid,amt,kind) values(?,?,?)').run(uid,-amt,kind)};

app.get('/api/state',auth,guard(q=>{
 const auctions=db.prepare('select * from auctions order by (status="live") desc,id desc limit 20').all().map(a=>({...a,left:Math.max(0,a.end_at-now()),mine:a.leader===q.uid}));
 const lots=db.prepare('select * from lots order by (status="open") desc,id desc limit 10').all().map(l=>({...l,taken:Object.fromEntries(db.prepare('select slot,uid from tickets where lot=?').all(l.id).map(t=>[t.slot,t.uid===q.uid?2:1])),won:l.winner===q.uid}));
 return{bal:db.prepare('select bal from users where id=?').get(q.uid).bal,admin:ADMINS.includes(q.uid),auctions,lots}}));

const bid=db.transaction((uid,name,id)=>{const a=db.prepare("select * from auctions where id=? and status='live'").get(id);
 if(!a||a.end_at<=now())throw 'Auksion tugagan';if(a.leader===uid)throw 'Siz allaqachon yetakchisiz';
 charge(uid,BID,'bid');db.prepare('update auctions set price=price+?,end_at=?,leader=?,leader_name=? where id=?').run(STEP,now()+SEC,uid,name,id)});
app.post('/api/bid',auth,guard(q=>{bid(q.uid,q.name,+q.body.id);return{ok:1}}));

const buy=db.transaction((uid,lotId,slot)=>{const l=db.prepare("select * from lots where id=? and status='open'").get(lotId);
 if(!l||!Number.isInteger(slot)||slot<1||slot>l.slots)throw 'Joy mavjud emas';
 charge(uid,l.price,'ticket');
 try{db.prepare('insert into tickets values(?,?,?)').run(lotId,slot,uid)}catch{throw 'Joy band'}
 if(db.prepare('select count(*) c from tickets where lot=?').get(lotId).c<l.slots)return null;
 const ws=crypto.randomInt(1,l.slots+1),w=db.prepare('select uid from tickets where lot=? and slot=?').get(lotId,ws).uid;
 db.prepare("update lots set status='done',winner=?,winner_slot=? where id=?").run(w,ws,lotId);return{l,w,ws}});
app.post('/api/buy',auth,guard(q=>{const d=buy(q.uid,+q.body.lot,+q.body.slot);
 if(d){say(d.w,`🎉 Tabriklaymiz! "${d.l.title}" lotereyasida №${d.ws} chipta yutdi. Admin siz bilan bogʻlanadi.`);ADMINS.forEach(a=>say(a,`🏆 Lotereya #${d.l.id} gʻolibi: user ${d.w}, chipta №${d.ws}`))}
 return{ok:1}}));

app.post('/api/topup',auth,async(q,r)=>{const a=Math.floor(+q.body.amount);if(!(a>=5000&&a<=5e6))return r.status(400).json({err:'Summa 5 000 – 5 000 000 oraligʻida'});
 const x=await tg('createInvoiceLink',{title:'Balansni toʻldirish',description:a+' soʻm',payload:'topup:'+q.uid,provider_token:PAY_TOKEN,currency:'UZS',prices:[{label:'Balans',amount:a*100}]});
 x.ok?r.json({link:x.result}):r.status(500).json({err:'Toʻlov tizimi xatosi'})});

const admin=(q,r,next)=>ADMINS.includes(q.uid)?next():r.sendStatus(403);
app.post('/api/admin/auction',auth,admin,guard(q=>{const b=q.body;db.prepare('insert into auctions(title,emoji,value,end_at) values(?,?,?,?)').run(String(b.title).slice(0,60),b.emoji||'🎁',+b.value||0,now()+(+b.minutes||5)*60);return{ok:1}}));
app.post('/api/admin/lot',auth,admin,guard(q=>{const b=q.body;db.prepare('insert into lots(title,emoji,price) values(?,?,?)').run(String(b.title).slice(0,60),b.emoji||'🎁',+b.price||10000);return{ok:1}}));

// Telegram webhook: toʻlov va /start
app.post('/tg',(q,r)=>{if(q.get('x-telegram-bot-api-secret-token')!==SECRET)return r.sendStatus(403);r.sendStatus(200);
 const u=q.body;if(u.pre_checkout_query)tg('answerPreCheckoutQuery',{pre_checkout_query_id:u.pre_checkout_query.id,ok:true});
 const m=u.message;if(!m)return;
 if(m.successful_payment){const p=m.successful_payment,amt=p.total_amount/100;
  db.transaction(()=>{if(db.prepare("insert or ignore into tx(uid,amt,kind,ref) values(?,?,'topup',?)").run(m.from.id,amt,p.telegram_payment_charge_id).changes)db.prepare('update users set bal=bal+? where id=?').run(amt,m.from.id)})();
  say(m.chat.id,`✅ Balans ${amt} soʻmga toʻldirildi`)}
 else if(m.text?.startsWith('/start'))tg('sendMessage',{chat_id:m.chat.id,text:'🎯 Omad Bozor: auksion va omadli chiptalar',reply_markup:{inline_keyboard:[[{text:'Oʻynash',web_app:{url:WEBAPP_URL}}]]}})});

// Tugagan auksionlarni yopish
setInterval(()=>{for(const a of db.prepare("select * from auctions where status='live' and end_at<=?").all(now())){
 if(!a.leader){db.prepare("update auctions set status='nobody' where id=?").run(a.id);continue}
 let ok=true;try{db.transaction(()=>charge(a.leader,a.price,'win'))()}catch{ok=false}
 db.prepare('update auctions set status=? where id=?').run(ok?'paid':'unpaid',a.id);
 say(a.leader,ok?`🎉 "${a.title}" sizniki! ${a.price} soʻm balansdan yechildi.`:`🎉 "${a.title}" ni yutdingiz (${a.price} soʻm), lekin balans yetarli emas. Admin bilan bogʻlaning.`);
 ADMINS.forEach(x=>say(x,`🔨 Auksion #${a.id} "${a.title}": gʻolib ${a.leader_name} (${a.leader}), ${a.price} soʻm, ${ok?'toʻlangan':'TOʻLANMAGAN'}`))}},1000);

app.listen(PORT,()=>{console.log('http://localhost:'+PORT);
 if(BOT_TOKEN&&WEBAPP_URL)tg('setWebhook',{url:WEBAPP_URL+'/tg',secret_token:SECRET,allowed_updates:['message','pre_checkout_query']})});
github.com/bahtiy797-lang/ArzoniBor-/edit/main/server.js
