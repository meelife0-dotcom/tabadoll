// Public share link: /livre/12  (rich preview for WhatsApp, Facebook, Google), then opens the book inside the app.
const esc=s=>String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
export async function onRequestGet({params,env,request}){
 const id=parseInt(params.id,10),origin=new URL(request.url).origin;
 const b=Number.isInteger(id)?await env.DB.prepare("SELECT title,author,cond,value,description,img IS NOT NULL AS hasImg FROM books WHERE id=?1").bind(id).first():null;
 if(!b)return Response.redirect(origin+"/",302);
 const t=`${b.title} – ${b.author} | Tabadol`,d=(b.description||`${b.cond}, valeur d'environ ${b.value} DH. À échanger sur Tabadol.`).slice(0,200);
 const img=b.hasImg?`<meta property="og:image" content="${origin}/api/photo/${id}">`:"";
 return new Response(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${esc(t)}</title><meta name="description" content="${esc(d)}"><meta property="og:title" content="${esc(t)}"><meta property="og:description" content="${esc(d)}"><meta property="og:type" content="website">${img}<meta http-equiv="refresh" content="0;url=/#/livre/${id}"></head><body><a href="/#/livre/${id}">Voir l'annonce sur Tabadol</a><script>location.replace("/#/livre/${id}")</script></body></html>`,{headers:{"content-type":"text/html;charset=utf-8","cache-control":"public, max-age=300"}});
}
