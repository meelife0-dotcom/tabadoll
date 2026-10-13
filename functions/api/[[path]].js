// Tabadol back end: Cloudflare Pages Functions + D1 (SQLite). All routes live under /api/.
const CITIES=["Casablanca","Rabat","Salé","Témara","Skhirat","Kénitra","Mohammedia","Marrakech","Fès","Meknès","Tanger","Tétouan","Martil","M'diq","Fnideq","Chefchaouen","Ouezzane","Larache","Asilah","Ksar El Kébir","Agadir","Inezgane","Aït Melloul","Taroudant","Tiznit","El Jadida","Berrechid","Settat","Khouribga","Oued Zem","Béni Mellal","Fquih Ben Salah","Azilal","Khénifra","Midelt","Errachidia","Tinghir","Ouarzazate","Zagora","Safi","Youssoufia","El Kelaâ des Sraghna","Essaouira","Khémisset","Sidi Kacem","Sidi Slimane","Souk El Arbaa","Ifrane","Azrou","Sefrou","Taza","Guercif","Al Hoceïma","Nador","Berkane","Taourirt","Oujda","Guelmim","Tan-Tan","Laâyoune","Dakhla"];
const CATS=["Roman","Science-fiction","Fantasy","Histoire","Biographie","Développement personnel","Jeunesse","Études"];
const CONDS=["Comme neuf","Bon état","Usé"];
const J=(d,s=200,h={})=>new Response(JSON.stringify(d),{status:s,headers:{"content-type":"application/json",...h}});
const E=(m,s=400)=>J({error:m},s);
const enc=new TextEncoder();
const hex=u=>[...u].map(x=>x.toString(16).padStart(2,"0")).join("");
const unhex=s=>Uint8Array.from(s.match(/../g)||[],h=>parseInt(h,16));
async function pbkdf2(pw,salt){const k=await crypto.subtle.importKey("raw",enc.encode(pw),"PBKDF2",false,["deriveBits"]);return hex(new Uint8Array(await crypto.subtle.deriveBits({name:"PBKDF2",hash:"SHA-256",salt,iterations:100000},k,256)))}
const okImg=s=>!s||(typeof s==="string"&&s.length<400000&&/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(s));
const str=(v,min,max)=>typeof v==="string"&&v.trim().length>=min&&v.trim().length<=max?v.trim():null;
// Flexible matching (case, accents, small words, partial titles, author names, small typos). Runs on the server so wishlists stay private.
const norm=s=>String(s).trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");
const clean=s=>norm(s).replace(/[^a-z0-9 ]/g," ").replace(/\b(the|a|an|le|la|les|l|un|une|des|de|du)\b/g," ").replace(/\s+/g," ").trim();
function lev(a,b){const d=[...Array(b.length+1).keys()];for(let i=1;i<=a.length;i++){let p=d[0];d[0]=i;for(let j=1;j<=b.length;j++){const t=d[j];d[j]=Math.min(d[j]+1,d[j-1]+1,p+(a[i-1]===b[j-1]?0:1));p=t}}return d[b.length]}
function fz(t,b){const w=clean(t);if(w.length<3)return false;
 return [clean(b.title),clean(b.author)].some(f=>f===w||f.includes(w)||(f.length>=4&&w.includes(f))||lev(f,w)<=Math.floor(Math.max(f.length,w.length)/5))}
const int=(v,min,max)=>Number.isInteger(+v)&&+v>=min&&+v<=max?+v:null;
function img(d){if(!d)return new Response("Not found",{status:404});const[h,b]=d.split(",");const bin=atob(b),u=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)u[i]=bin.charCodeAt(i);return new Response(u,{headers:{"content-type":h.slice(5,h.indexOf(";")),"cache-control":"public, max-age=3600"}})}

export async function onRequest({request,env,params}){
 const p=[].concat(params.path||[]),m=request.method,now=Date.now();
 const q=(sql,...a)=>env.DB.prepare(sql).bind(...a);
 try{
  // CSRF protection: every write must carry this custom header (browsers block it cross-site)
  if(m!=="GET"&&request.headers.get("x-requested-with")!=="tabadol")return E("Requête refusée.",403);
  const body=m==="POST"||m==="PATCH"?await request.json().catch(()=>({})):{};
  const ck=(request.headers.get("cookie")||"").match(/(?:^|; )sid=([a-f0-9]{64})/);
  const me=ck?await q("SELECT u.id,u.name,u.city FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=?1 AND s.expires>?2",ck[1],now).first():null;
  const startSession=async id=>{const t=hex(crypto.getRandomValues(new Uint8Array(32)));await q("INSERT INTO sessions(token,user_id,expires) VALUES(?1,?2,?3)",t,id,now+30*864e5).run();return J({ok:true},200,{"set-cookie":`sid=${t}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000`})};
  const [a,b,c]=p;

  // ---- public routes
  if(m==="GET"&&a==="photo")return img((c?await q("SELECT img FROM book_photos WHERE book_id=?1 AND n=?2",+b,+c).first():await q("SELECT img FROM books WHERE id=?1",+b).first())?.img);
  if(m==="GET"&&a==="avatar")return img((await q("SELECT avatar FROM users WHERE name=?1",decodeURIComponent(b||"")).first())?.avatar);
  // public catalogue for visitors without an account: city only, never the owner's name
  if(m==="GET"&&a==="public"){
   const rows=(await q("SELECT b.id,b.title,b.author,b.cat,b.cond,b.value,b.description,b.img IS NOT NULL AS hasImg,(SELECT COUNT(*) FROM book_photos p WHERE p.book_id=b.id) AS extra,u.city FROM books b JOIN users u ON u.id=b.owner_id ORDER BY b.id DESC LIMIT 300").all()).results;
   return J({books:rows},200,{"cache-control":"public, max-age=60"});
  }
  // public "Je cherche" board for visitors: city only, never the member's name
  if(m==="GET"&&a==="wants"){
   const rows=(await q("SELECT w.id,w.title,w.note,w.created,u.city,(SELECT COUNT(*) FROM want_replies r WHERE r.want_id=w.id) AS replyCount FROM wants w JOIN users u ON u.id=w.user_id WHERE w.status='open' ORDER BY w.id DESC LIMIT 100").all()).results;
   return J({wants:rows},200,{"cache-control":"public, max-age=60"});
  }
  // public listing data (used by shared links): never includes the owner's name
  if(m==="GET"&&a==="book"){
   const bk=await q("SELECT b.id,b.title,b.author,b.cat,b.cond,b.value,b.description,b.img IS NOT NULL AS hasImg,(SELECT COUNT(*) FROM book_photos p WHERE p.book_id=b.id) AS extra,u.city,u.id AS uid FROM books b JOIN users u ON u.id=b.owner_id WHERE b.id=?1",+b).first();
   if(!bk)return E("Annonce introuvable.",404);
   const rt=await q("SELECT ROUND(AVG(r.stars),1) AS avg,COUNT(*) AS n FROM ratings r JOIN requests s ON s.id=r.request_id WHERE r.ratee_id=?1 AND (EXISTS(SELECT 1 FROM ratings r2 WHERE r2.request_id=r.request_id AND r2.rater_id=r.ratee_id) OR s.done_at<?2)",bk.uid,now-7*864e5).first();
   const{uid,...pub}=bk;return J({...pub,photos:(bk.hasImg?1:0)+bk.extra,avg:rt.avg,n:rt.n});
  }

  if(m==="POST"&&a==="signup"){
   const name=str(body.name,2,30),email=str(body.email,5,120)?.toLowerCase(),pw=body.password,city=body.city,phone=str(body.phone||"",0,20);
   if(!name||!/^[\p{L}\p{N}_. -]+$/u.test(name))return E("Nom d'utilisateur invalide (2 à 30 caractères).");
   if(!email||!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))return E("E-mail invalide.");
   if(typeof pw!=="string"||pw.length<8||pw.length>100)return E("Mot de passe : 8 caractères minimum.");
   if(!CITIES.includes(city))return E("Choisissez votre ville.");
   if(!okImg(body.avatar))return E("Photo invalide ou trop lourde.");
   const salt=crypto.getRandomValues(new Uint8Array(16));
   try{
    const r=await q("INSERT INTO users(name,email,pass,city,phone,avatar,created) VALUES(?1,?2,?3,?4,?5,?6,?7)",name,email,hex(salt)+":"+await pbkdf2(pw,salt),city,phone,body.avatar||null,now).run();
    return startSession(r.meta.last_row_id);
   }catch(e){return E("Ce nom d'utilisateur ou cet e-mail est déjà utilisé.",409)}
  }
  if(m==="POST"&&a==="login"){
   const u=await q("SELECT id,pass FROM users WHERE email=?1",String(body.email||"").trim().toLowerCase()).first();
   const[salt,h]=(u?.pass||"00:").split(":");
   const same=!!u&&(await pbkdf2(String(body.password||""),unhex(salt)))===h;
   return same?startSession(u.id):E("E-mail ou mot de passe incorrect.",401);
  }
  if(m==="POST"&&a==="logout"){
   if(ck)await q("DELETE FROM sessions WHERE token=?1",ck[1]).run();
   return J({ok:true},200,{"set-cookie":"sid=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0"});
  }
  if(m==="GET"&&a==="state"){
   if(!me)return J({me:null});
   const r=await env.DB.batch([
    q("SELECT name,city,avatar IS NOT NULL AS av FROM users"),
    q("SELECT b.id,b.title,b.author,b.cat,b.cond,b.value,b.img IS NOT NULL AS hasImg,b.description AS description,(SELECT COUNT(*) FROM book_photos p WHERE p.book_id=b.id) AS extra,u.name AS owner FROM books b JOIN users u ON u.id=b.owner_id ORDER BY b.id DESC"),
    q("SELECT id,title FROM wishes WHERE user_id=?1 ORDER BY id",me.id),
    q("SELECT r.id,f.name AS fromName,t.name AS toName,r.want_id AS want,r.offer_id AS offer,r.money,r.status,r.from_ok AS fromOk,r.to_ok AS toOk,r.done_at AS doneAt,(SELECT COUNT(*) FROM messages m WHERE m.request_id=r.id AND m.sender_id!=?1 AND m.id>COALESCE((SELECT last_id FROM chat_reads c WHERE c.request_id=r.id AND c.user_id=?1),0)) AS unread,EXISTS(SELECT 1 FROM ratings x WHERE x.request_id=r.id AND x.rater_id=?1) AS iRated FROM requests r JOIN users f ON f.id=r.from_id JOIN users t ON t.id=r.to_id WHERE r.from_id=?1 OR r.to_id=?1 ORDER BY r.id DESC",me.id),
    // a rating counts once both people rated, or 7 days after the swap (stops revenge ratings)
    q("SELECT u.name,ROUND(AVG(r.stars),1) AS avg,COUNT(*) AS n FROM ratings r JOIN users u ON u.id=r.ratee_id JOIN requests s ON s.id=r.request_id WHERE EXISTS(SELECT 1 FROM ratings r2 WHERE r2.request_id=r.request_id AND r2.rater_id=r.ratee_id) OR s.done_at<?1 GROUP BY u.id",now-7*864e5),
    q("SELECT u.name,COUNT(*) AS n FROM requests s JOIN users u ON u.id IN (s.from_id,s.to_id) WHERE s.status='done' GROUP BY u.id"),
    q("SELECT u.name AS user,w.title FROM wishes w JOIN users u ON u.id=w.user_id"),
    q("SELECT w.id,w.title,w.note,w.status,w.created,u.name AS owner,u.city,(SELECT COUNT(*) FROM want_replies r WHERE r.want_id=w.id) AS replyCount,EXISTS(SELECT 1 FROM want_replies r WHERE r.want_id=w.id AND r.user_id=?1) AS iReplied FROM wants w JOIN users u ON u.id=w.user_id WHERE w.status='open' OR w.user_id=?1 ORDER BY w.id DESC LIMIT 200",me.id),
    q("SELECT r.id,r.want_id AS want,r.book_id AS book,r.seen,u.name AS user FROM want_replies r JOIN wants w ON w.id=r.want_id JOIN users u ON u.id=r.user_id WHERE w.user_id=?1",me.id)]);
   // Mutual matches are computed here: members only receive THEIR matches, never other members' wishlists.
   const bks=r[1].results,allW=r[6].results,myW=allW.filter(x=>x.user===me.name),wishOf={},res=[];
   allW.forEach(x=>(wishOf[x.user]=wishOf[x.user]||[]).push(x.title));
   for(const u of new Set(bks.map(b=>b.owner))){if(u===me.name)continue;
    const theirs=bks.filter(b=>b.owner===u&&myW.some(x=>fz(x.title,b))),mine=bks.filter(b=>b.owner===me.name&&(wishOf[u]||[]).some(t=>fz(t,b)));
    theirs.forEach(t=>mine.forEach(m=>res.push({user:u,theirs:t.id,mine:m.id})))}
   return J({me:{name:me.name,city:me.city},matches:res,users:r[0].results,books:r[1].results,wishes:r[2].results,requests:r[3].results,ratings:r[4].results,swaps:r[5].results,wants:r[7].results,replies:r[8].results});
  }

  // ---- members only
  if(!me)return E("Connectez-vous d'abord.",401);

  if(m==="PATCH"&&a==="me"){
   if(!CITIES.includes(body.city))return E("Ville invalide.");
   await q("UPDATE users SET city=?1 WHERE id=?2",body.city,me.id).run();return J({ok:true});
  }
  if(m==="POST"&&a==="books"){
   const t=str(body.title,1,120),au=str(body.author,1,80),v=int(body.value,5,100000),ds=str(body.description||"",0,500),ex=Array.isArray(body.imgs)?body.imgs.slice(0,2):[];
   if(!t||!au||v===null||ds===null||!CATS.includes(body.cat)||!CONDS.includes(body.cond)||!okImg(body.img)||!ex.every(x=>x&&okImg(x)))return E("Informations du livre invalides.");
   const r=await q("INSERT INTO books(owner_id,title,author,cat,cond,value,img,description,created) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9)",me.id,t,au,body.cat,body.cond,v,body.img||null,ds,now).run();
   if(ex.length)await env.DB.batch(ex.map((x,i)=>q("INSERT INTO book_photos(book_id,n,img) VALUES(?1,?2,?3)",r.meta.last_row_id,i+1,x)));
   return J({id:r.meta.last_row_id});
  }
  if(m==="DELETE"&&a==="books"){
   const id=+b;
   if(!(await q("SELECT 1 FROM books WHERE id=?1 AND owner_id=?2",id,me.id).first()))return E("Livre introuvable.",404);
   if(await q("SELECT 1 FROM requests WHERE status='accepted' AND (want_id=?1 OR offer_id=?1)",id).first())return E("Ce livre est réservé par un échange en cours.",409);
   await env.DB.batch([q("DELETE FROM requests WHERE status='pending' AND (want_id=?1 OR offer_id=?1)",id),q("DELETE FROM book_photos WHERE book_id=?1",id),q("DELETE FROM want_replies WHERE book_id=?1",id),q("DELETE FROM books WHERE id=?1",id)]);
   return J({ok:true});
  }
  if(m==="POST"&&a==="wishes"){
   const t=str(body.title,2,80);if(!t)return E("Titre invalide.");
   if((await q("SELECT COUNT(*) AS n FROM wishes WHERE user_id=?1",me.id).first()).n>=50)return E("50 envies maximum.");
   await q("INSERT INTO wishes(user_id,title) VALUES(?1,?2)",me.id,t).run();return J({ok:true});
  }
  if(m==="DELETE"&&a==="wishes"){await q("DELETE FROM wishes WHERE id=?1 AND user_id=?2",+b,me.id).run();return J({ok:true})}

  if(m==="POST"&&a==="requests"&&!b){
   const w=await q("SELECT id,owner_id FROM books WHERE id=?1",+body.want).first();
   const o=await q("SELECT id,owner_id FROM books WHERE id=?1",+body.offer).first();
   const money=int(body.money||0,0,100000);
   if(!w||!o||money===null||w.owner_id===me.id||o.owner_id!==me.id)return E("Demande invalide.");
   if(await q("SELECT 1 FROM requests WHERE status='accepted' AND (want_id IN (?1,?2) OR offer_id IN (?1,?2))",w.id,o.id).first())return E("Un de ces livres est déjà réservé par un échange en cours.",409);
   if(await q("SELECT 1 FROM requests WHERE status='pending' AND from_id=?1 AND want_id=?2 AND offer_id=?3",me.id,w.id,o.id).first())return E("Demande déjà envoyée.",409);
   await q("INSERT INTO requests(from_id,to_id,want_id,offer_id,money,status,created) VALUES(?1,?2,?3,?4,?5,'pending',?6)",me.id,w.owner_id,w.id,o.id,money,now).run();
   return J({ok:true});
  }
  const myReq=async id=>(await q("SELECT * FROM requests WHERE id=?1 AND (from_id=?2 OR to_id=?2)",+id,me.id).first())||null;
  const chatOpen=r=>r.status==="accepted"||(r.status==="done"&&now-r.done_at<7*864e5);
  if(m==="GET"&&a==="unread"){
   return J(await q("SELECT (SELECT COUNT(*) FROM requests WHERE to_id=?1 AND status='pending') AS pending,(SELECT COUNT(*) FROM messages m JOIN requests r ON r.id=m.request_id WHERE (r.from_id=?1 OR r.to_id=?1) AND m.sender_id!=?1 AND m.id>COALESCE((SELECT last_id FROM chat_reads c WHERE c.request_id=r.id AND c.user_id=?1),0)) AS unread,(SELECT COUNT(*) FROM want_replies r JOIN wants w ON w.id=r.want_id WHERE w.user_id=?1 AND w.status='open' AND r.seen=0) AS replies",me.id).first());
  }
  // ---- mini chat (one conversation per accepted swap)
  if(m==="GET"&&a==="requests"&&b&&c==="messages"){
   const r=await myReq(b);if(!r||!["accepted","done","cancelled"].includes(r.status))return E("Discussion introuvable.",404);
   const after=+new URL(request.url).searchParams.get("after")||0;
   const rows=(await q("SELECT id,sender_id,body,kind,created FROM messages WHERE request_id=?1 AND id>?2 ORDER BY id LIMIT 200",r.id,after).all()).results;
   if(rows.length)await q("INSERT INTO chat_reads(request_id,user_id,last_id) VALUES(?1,?2,?3) ON CONFLICT(request_id,user_id) DO UPDATE SET last_id=MAX(last_id,?3)",r.id,me.id,rows[rows.length-1].id).run();
   return J({open:chatOpen(r),messages:rows.map(x=>({id:x.id,mine:x.sender_id===me.id,body:x.body,kind:x.kind,at:x.created}))});
  }
  if(m==="POST"&&a==="requests"&&b&&c==="messages"){
   const r=await myReq(b);if(!r||!chatOpen(r))return E("Discussion fermée.",403);
   const t=str(body.body,1,500);if(!t)return E("Message vide ou trop long.");
   if((await q("SELECT COUNT(*) AS n FROM messages WHERE sender_id=?1 AND created>?2",me.id,now-60000).first()).n>=15)return E("Trop de messages. Patientez un instant.",429);
   await q("INSERT INTO messages(request_id,sender_id,body,kind,created) VALUES(?1,?2,?3,?4,?5)",r.id,me.id,t,body.kind==="meet"?"meet":"text",now).run();
   return J({ok:true});
  }
  // ---- ratings: only after a finished swap, one per person, within 14 days
  if(m==="POST"&&a==="requests"&&b&&c==="rate"){
   const r=await myReq(b);if(!r||r.status!=="done"||now-r.done_at>14*864e5)return E("Notation impossible.",409);
   const s=int(body.stars,1,5);if(s===null)return E("Choisissez une note de 1 à 5.");
   const tags=(Array.isArray(body.tags)?body.tags:[]).filter(t=>["Ponctuel","Livre conforme","Aimable"].includes(t)).join(",");
   try{await q("INSERT INTO ratings(request_id,rater_id,ratee_id,stars,tags,comment,created) VALUES(?1,?2,?3,?4,?5,?6,?7)",r.id,me.id,r.from_id===me.id?r.to_id:r.from_id,s,tags,str(body.comment||"",0,300)||"",now).run()}
   catch(e){return E("Vous avez déjà noté cet échange.",409)}
   return J({ok:true});
  }
  if(m==="POST"&&a==="report"){
   const u=await q("SELECT id FROM users WHERE name=?1",String(body.user||"")).first(),why=str(body.reason,3,300);
   if(!u||!why||u.id===me.id)return E("Signalement invalide.");
   await q("INSERT INTO reports(reporter_id,user_id,request_id,reason,created) VALUES(?1,?2,?3,?4,?5)",me.id,u.id,+body.request||null,why,now).run();
   return J({ok:true});
  }
  // ---- "Je cherche" board: members post the book they want; others answer with a book from their shelf
  const badText=s=>/(\d[\s.\-]*){8,}|@|https?:|www\./i.test(s);
  if(m==="POST"&&a==="wants"&&!b){
   const t=str(body.title,2,100),nt=str(body.note||"",0,200);
   if(!t||nt===null)return E("Titre invalide.");
   if(badText(t)||badText(nt))return E("N'écrivez pas de numéro de téléphone, d'e-mail ou de lien.");
   if((await q("SELECT COUNT(*) AS n FROM wants WHERE user_id=?1 AND status='open'",me.id).first()).n>=5)return E("Maximum 5 recherches ouvertes.");
   if((await q("SELECT COUNT(*) AS n FROM wants WHERE user_id=?1 AND created>?2",me.id,now-864e5).first()).n>=10)return E("Trop de recherches aujourd'hui.");
   const open=(await q("SELECT title FROM wants WHERE user_id=?1 AND status='open'",me.id).all()).results;
   if(open.some(x=>clean(x.title)===clean(t)))return E("Vous avez déjà publié cette recherche.");
   await q("INSERT INTO wants(user_id,title,note,created) VALUES(?1,?2,?3,?4)",me.id,t,nt,now).run();
   return J({ok:true});
  }
  if(m==="POST"&&a==="wants"&&b==="seen"){
   await q("UPDATE want_replies SET seen=1 WHERE want_id IN (SELECT id FROM wants WHERE user_id=?1)",me.id).run();return J({ok:true});
  }
  if(a==="wants"&&b&&b!=="seen"){
   const w=await q("SELECT * FROM wants WHERE id=?1",+b).first();if(!w)return E("Recherche introuvable.",404);
   if(m==="DELETE"){
    if(w.user_id!==me.id)return E("Recherche introuvable.",404);
    await env.DB.batch([q("DELETE FROM want_replies WHERE want_id=?1",w.id),q("DELETE FROM wants WHERE id=?1",w.id)]);return J({ok:true});
   }
   if(m==="POST"&&c==="found"){
    if(w.user_id!==me.id)return E("Recherche introuvable.",404);
    await q("UPDATE wants SET status='found' WHERE id=?1",w.id).run();return J({ok:true});
   }
   if(m==="POST"&&c==="reply"){
    if(w.status!=="open")return E("Cette recherche est fermée.",409);
    if(w.user_id===me.id)return E("Vous ne pouvez pas répondre à votre propre recherche.");
    const bk=await q("SELECT id FROM books WHERE id=?1 AND owner_id=?2",+body.book,me.id).first();if(!bk)return E("Ce livre n'est pas sur votre étagère.");
    if((await q("SELECT COUNT(*) AS n FROM want_replies WHERE want_id=?1",w.id).first()).n>=30)return E("Trop de réponses pour cette recherche.",409);
    try{await q("INSERT INTO want_replies(want_id,user_id,book_id,created) VALUES(?1,?2,?3,?4)",w.id,me.id,bk.id,now).run()}
    catch(e){return E("Vous avez déjà répondu avec ce livre.",409)}
    return J({ok:true});
   }
  }
  // ---- swap lifecycle: pending > accepted (chat opens) > done (both confirmed after meeting)
  if(m==="POST"&&a==="requests"&&b&&["accept","decline","cancel","confirm"].includes(c)){
   const r=await myReq(b);if(!r)return E("Demande introuvable.",404);
   const isTo=r.to_id===me.id,isFrom=r.from_id===me.id;
   if((c==="accept"||c==="decline")&&(!isTo||r.status!=="pending"))return E("Demande introuvable.",404);
   if(c==="cancel"&&!((r.status==="pending"&&isFrom)||r.status==="accepted"))return E("Annulation impossible.",409);
   if(c==="confirm"&&r.status!=="accepted")return E("Échange non confirmable.",409);
   if(c==="decline"){await q("UPDATE requests SET status='declined' WHERE id=?1",r.id).run();return J({ok:true})}
   if(c==="cancel"){await q("UPDATE requests SET status='cancelled' WHERE id=?1",r.id).run();return J({ok:true})}
   const w=await q("SELECT owner_id FROM books WHERE id=?1",r.want_id).first(),o=await q("SELECT owner_id FROM books WHERE id=?1",r.offer_id).first();
   if(!w||!o||w.owner_id!==r.to_id||o.owner_id!==r.from_id){await q("UPDATE requests SET status='cancelled' WHERE id=?1",r.id).run();return E("Ce livre n'est plus disponible.",409)}
   if(c==="accept"){
    await env.DB.batch([q("UPDATE requests SET status='accepted' WHERE id=?1",r.id),q("UPDATE requests SET status='cancelled' WHERE status='pending' AND id!=?3 AND (want_id IN (?1,?2) OR offer_id IN (?1,?2))",r.want_id,r.offer_id,r.id)]);
    return J({ok:true});
   }
   // confirm: the books change owner only when BOTH people have confirmed the meeting
   await q(isFrom?"UPDATE requests SET from_ok=1 WHERE id=?1":"UPDATE requests SET to_ok=1 WHERE id=?1",r.id).run();
   const f=await q("SELECT from_ok,to_ok FROM requests WHERE id=?1",r.id).first();
   const both=!!(f.from_ok&&f.to_ok);
   if(both)await env.DB.batch([q("UPDATE books SET owner_id=?1 WHERE id=?2",r.from_id,r.want_id),q("UPDATE books SET owner_id=?1 WHERE id=?2",r.to_id,r.offer_id),q("UPDATE requests SET status='done',done_at=?2 WHERE id=?1",r.id,now)]);
   return J({ok:true,done:both});
  }
  return E("Introuvable.",404);
 }catch(e){return E("Erreur du serveur.",500)}
}
