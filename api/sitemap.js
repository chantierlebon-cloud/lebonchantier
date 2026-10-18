// Dynamic sitemap: only local pages with >=3 real, publicly readable listings.
// Does not expose private data and does not manufacture empty city/category pages.
const BASE='https://trouvepro.fr';
const DB='https://dclkwnpswocvrgmmvkby.supabase.co';
const KEY='sb_publishable_URHzjrUJLarzOBZznhLceA_iuOFpPX0';
const cats=['Plomberie','Électricité','Peinture','Maçonnerie','Rénovation','Jardinage','Ménage','Déménagement','Menuiserie','Carrelage'];
const cities=['Paris','Lyon','Marseille','Toulouse','Bordeaux','Lille','Nantes','Nice','Strasbourg','Montpellier','Rennes','Grenoble'];
const slug=s=>String(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
module.exports=async(req,res)=>{
 res.setHeader('Content-Type','application/xml; charset=utf-8');
 res.setHeader('Cache-Control','public, s-maxage=3600, stale-while-revalidate=7200');
 let urls=[BASE+'/'];
 try{
  const counts=new Map();
  // Cap reads to 3000 recent public rows. Avoid listing a route if the source is unavailable.
  for(let offset=0;offset<3000;offset+=1000){
   const u=new URL(DB+'/rest/v1/annonces_publiques');
   u.searchParams.set('select','categorie,ville');
   u.searchParams.set('order','created_at.desc');
   u.searchParams.set('limit','1000');
   u.searchParams.set('offset',String(offset));
   const r=await fetch(u,{headers:{apikey:KEY,Authorization:'Bearer '+KEY},signal:AbortSignal.timeout(7000)});
   if(!r.ok)throw Error('Unable to read public listings');
   const rows=await r.json();if(!Array.isArray(rows))throw Error('Invalid public listings');
   for(const a of rows){
    for(const cat of cats){if(!slug(a.categorie||'').includes(slug(cat)))continue;
     for(const city of cities){if(!slug(a.ville||'').includes(slug(city)))continue;
      const k=slug(cat)+'/'+slug(city);counts.set(k,(counts.get(k)||0)+1);
     }
    }
   }
   if(rows.length<1000)break;
  }
  urls.push(...[...counts].filter(([,n])=>n>=3).map(([p])=>BASE+'/annonces-locales/'+p));
 }catch(e){
  // Fail closed: the homepage is the only safe fallback; no fabricated URLs.
 }
 res.statusCode=200;
 res.end('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'+urls.map(u=>'  <url><loc>'+u+'</loc></url>').join('\n')+'\n</urlset>\n');
};
