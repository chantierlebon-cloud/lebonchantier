// Server-rendered, data-backed local job pages. No secrets or private tables.
// URL: /annonces-locales/<category>/<city> (French slugs).
const SUPABASE='https://dclkwnpswocvrgmmvkby.supabase.co';
const ANON_KEY='sb_publishable_URHzjrUJLarzOBZznhLceA_iuOFpPX0';
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const slug=s=>String(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
const knownCats=['Plomberie','Électricité','Peinture','Maçonnerie','Rénovation','Jardinage','Ménage','Déménagement','Menuiserie','Carrelage'];
const knownCities=['Paris','Lyon','Marseille','Toulouse','Bordeaux','Lille','Nantes','Nice','Strasbourg','Montpellier','Rennes','Grenoble'];
module.exports=async(req,res)=>{
 res.setHeader('Content-Type','text/html; charset=utf-8');
 res.setHeader('Cache-Control','public, s-maxage=300, stale-while-revalidate=600');
 const path=(req.url||'').split('?')[0].split('/').filter(Boolean);
 const cat=knownCats.find(x=>slug(x)===path[1]);
 const city=knownCities.find(x=>slug(x)===path[2]);
 if(path.length!==3||path[0]!=='annonces-locales'||!cat||!city){res.statusCode=404;return res.end('<!doctype html><html lang="fr"><meta charset="utf-8"><title>Page introuvable</title><meta name="robots" content="noindex"><body><h1>Page introuvable</h1><a href="/">TrouvePro</a></body></html>')}
 let items=[],error=false;
 try{
  const u=new URL(SUPABASE+'/rest/v1/annonces_publiques');
  u.searchParams.set('select','id,categorie,ville,description,statut,created_at');
  u.searchParams.set('categorie','ilike.*'+cat+'*');
  u.searchParams.set('ville','ilike.*'+city+'*');
  u.searchParams.set('order','created_at.desc');
  u.searchParams.set('limit','30');
  const response=await fetch(u,{headers:{apikey:ANON_KEY,Authorization:'Bearer '+ANON_KEY},signal:AbortSignal.timeout(6000)});
  if(!response.ok)throw Error('Public view unavailable');
  const data=await response.json();if(!Array.isArray(data))throw Error('Invalid data');
  items=data.filter(a=>a.id&&a.ville&&a.categorie&&slug(a.ville).includes(slug(city))&&slug(a.categorie).includes(slug(cat)));
 }catch(e){error=true}
 const title='Annonces de '+cat.toLowerCase()+' à '+city+' | TrouvePro';
 const desc='Consultez les annonces de '+cat.toLowerCase()+' à '+city+' sur TrouvePro. Découvrez les demandes de travaux et services publiées localement.';
 const canonical='https://trouvepro.fr/annonces-locales/'+slug(cat)+'/'+slug(city);
 // Noindex for thin/empty pages. Indexing is enabled only for 3+ real public listings.
 const indexable=!error&&items.length>=3;
 const cards=items.map(a=>'<article class="card"><div class="pill">'+escape(a.categorie)+'</div><h2>'+escape(a.categorie)+' à '+escape(a.ville)+'</h2><p>'+escape((a.description||'').slice(0,220))+'</p><a href="/annonce?id='+encodeURIComponent(a.id)+'">Voir l’annonce →</a></article>').join('');
 res.statusCode=error?503:200;
 res.end('<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+escape(title)+'</title><meta name="description" content="'+escape(desc)+'"><meta name="robots" content="'+(indexable?'index,follow':'noindex,follow')+'"><link rel="canonical" href="'+canonical+'"><style>body{margin:0;background:#f1f2f0;color:#223039;font:16px/1.6 system-ui,-apple-system,sans-serif}header{background:white;border-bottom:1px solid #e3e6e4;padding:18px max(20px,calc((100vw - 1100px)/2))}a{color:#b43110}header a{font-size:24px;font-weight:800;text-decoration:none;color:#223039}header b{color:#c5340a}main{max-width:1100px;margin:auto;padding:48px 20px 90px}h1{font-size:clamp(30px,4vw,46px);line-height:1.15;letter-spacing:-.04em}.intro{color:#52616a;max-width:700px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:16px;margin-top:30px}.card{background:white;border:1px solid #e3e6e4;border-radius:16px;padding:24px;box-shadow:0 5px 20px #2230390a}.card h2{font-size:19px}.card p{color:#52616a}.pill{display:inline-block;background:#fff1eb;color:#ad2d0c;padding:4px 10px;border-radius:20px;font-size:12px;font-weight:700}.back{display:inline-block;margin-top:30px}footer{background:#223039;color:white;text-align:center;padding:25px}footer a{color:white}</style></head><body><header><a href="/">Trouve<b>Pro</b></a></header><main><a href="/">Accueil</a><h1>'+escape(title.replace(' | TrouvePro',''))+'</h1><p class="intro">'+escape(desc)+'</p>'+(error?'<p>Les annonces sont temporairement indisponibles.</p>':items.length?'<div class="grid">'+cards+'</div>':'<p>Aucune annonce disponible pour cette recherche actuellement.</p>')+'<a class="back" href="/">← Retour à TrouvePro</a></main><footer><a href="/">TrouvePro.fr</a> — Trouvez des professionnels près de chez vous.</footer></body></html>');
};
