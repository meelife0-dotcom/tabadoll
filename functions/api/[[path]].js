// Tabadol back end: Cloudflare Pages Functions + D1 (SQLite). All routes live under /api/.
const CITIES=["Casablanca","Rabat","Kénitra","Marrakech","Fès","Meknès","Tanger","Tétouan","Agadir","El Jadida","Oujda"];
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
  if(m==="GET"&&a==="photo")return img((await q("SELECT img FROM books WHERE id=?1",+b).first())?.img);
  if(m==="GET"&&a==="avatar")return img((await q("SELECT avatar FROM users WHERE name=?1",decodeURIComponent(b||"")).first())?.avatar);

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
    q("SELECT b.id,b.title,b.author,b.cat,b.cond,b.value,b.img IS NOT NULL AS hasImg,u.name AS owner FROM books b JOIN users u ON u.id=b.owner_id ORDER BY b.id DESC"),
    q("SELECT w.id,w.title,u.name AS user FROM wishes w JOIN users u ON u.id=w.user_id"),
    q("SELECT r.id,f.name AS fromName,t.name AS toName,r.want_id AS want,r.offer_id AS offer,r.money,r.status FROM requests r JOIN users f ON f.id=r.from_id JOIN users t ON t.id=r.to_id WHERE r.from_id=?1 OR r.to_id=?1 ORDER BY r.id DESC",me.id)]);
   return J({me:{name:me.name,city:me.city},users:r[0].results,books:r[1].results,wishes:r[2].results,requests:r[3].results});
  }

  // ---- members only
  if(!me)return E("Connectez-vous d'abord.",401);

  if(m==="PATCH"&&a==="me"){
   if(!CITIES.includes(body.city))return E("Ville invalide.");
   await q("UPDATE users SET city=?1 WHERE id=?2",body.city,me.id).run();return J({ok:true});
  }
  if(m==="POST"&&a==="books"){
   const t=str(body.title,1,120),au=str(body.author,1,80),v=int(body.value,5,100000);
   if(!t||!au||v===null||!CATS.includes(body.cat)||!CONDS.includes(body.cond)||!okImg(body.img))return E("Informations du livre invalides.");
   const r=await q("INSERT INTO books(owner_id,title,author,cat,cond,value,img,created) VALUES(?1,?2,?3,?4,?5,?6,?7,?8)",me.id,t,au,body.cat,body.cond,v,body.img||null,now).run();
   return J({id:r.meta.last_row_id});
  }
  if(m==="DELETE"&&a==="books"){
   const id=+b;
   if(!(await q("SELECT 1 FROM books WHERE id=?1 AND owner_id=?2",id,me.id).first()))return E("Livre introuvable.",404);
   await env.DB.batch([q("DELETE FROM requests WHERE status='pending' AND (want_id=?1 OR offer_id=?1)",id),q("DELETE FROM books WHERE id=?1",id)]);
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
   if(await q("SELECT 1 FROM requests WHERE status='pending' AND from_id=?1 AND want_id=?2 AND offer_id=?3",me.id,w.id,o.id).first())return E("Demande déjà envoyée.",409);
   await q("INSERT INTO requests(from_id,to_id,want_id,offer_id,money,status,created) VALUES(?1,?2,?3,?4,?5,'pending',?6)",me.id,w.owner_id,w.id,o.id,money,now).run();
   return J({ok:true});
  }
  if(m==="POST"&&a==="requests"&&b&&["accept","decline","cancel"].includes(c)){
   const r=await q("SELECT * FROM requests WHERE id=?1 AND status='pending'",+b).first();
   if(!r||(c==="cancel"?r.from_id:r.to_id)!==me.id)return E("Demande introuvable.",404);
   if(c!=="accept"){await q("UPDATE requests SET status=?1 WHERE id=?2",c==="decline"?"declined":"cancelled",r.id).run();return J({ok:true})}
   const w=await q("SELECT owner_id FROM books WHERE id=?1",r.want_id).first(),o=await q("SELECT owner_id FROM books WHERE id=?1",r.offer_id).first();
   if(!w||!o||w.owner_id!==r.to_id||o.owner_id!==r.from_id){await q("UPDATE requests SET status='cancelled' WHERE id=?1",r.id).run();return E("Ce livre n'est plus disponible.",409)}
   await env.DB.batch([
    q("UPDATE books SET owner_id=?1 WHERE id=?2",r.from_id,r.want_id),
    q("UPDATE books SET owner_id=?1 WHERE id=?2",r.to_id,r.offer_id),
    q("UPDATE requests SET status='accepted' WHERE id=?1",r.id),
    q("UPDATE requests SET status='cancelled' WHERE status='pending' AND (want_id IN (?1,?2) OR offer_id IN (?1,?2))",r.want_id,r.offer_id)]);
   return J({ok:true});
  }
  return E("Introuvable.",404);
 }catch(e){return E("Erreur du serveur.",500)}
}
