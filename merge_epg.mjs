// safe_merge_epg.mjs
import fs from "fs/promises";
const MAIN = "https://tvit.leicaflorianrobert.dev/epg/list.json";

async function fetchJson(u){const r=await fetch(u);if(!r.ok)throw Error(r.status);return r.json();}
const clean = t=>String(t||"").toLowerCase().replace(/\s|-/g,"");

async function main(){
  const base = await fetchJson(MAIN);
  const out = Array.isArray(base)?base:[];
  const today = new Date(), y=today.getUTCFullYear(), m=String(today.getUTCMonth()+1).padStart(2,"0"), d=String(today.getUTCDate()).padStart(2,"0");
  const date = `${y}${m}${d}`, next=`${y}${m}${String(Number(d)+1).padStart(2,"0")}`;
  const add=[];

  // --- Rai Sport ---
  try{
    const j=await fetchJson(`https://epg.pw/api/epg.json?lang=en&date=${date}&channel_id=392165`);
    const list=(j.epg_list||[]).slice(0,50).map((p,i,a)=>({
      title:p.title||"",description:p.desc||"",start:p.start_date,
      end:a[i+1]?a[i+1].start_date:null,poster:null
    }));
    add.push({name:"Rai Sport",logo:j.icon||"",programs:list});
  }catch(e){console.warn("Rai Sport",e.message);}

  // --- RSI helper ---
  async function rsi(id,name){
    try{
      const j=await fetchJson(`https://services.sg101.prd.sctv.ch/catalog/tv/channels/list/(ids=${id};start=${date}0600;end=${next}0600;level=normal)`);
      const ch=j.channels?.[0]; if(!ch) return;
      const list=(ch.programs||[]).slice(0,50).map(p=>({
        title:p.title||"",description:p.description||"",start:p.start,end:p.end,poster:p.image||null
      }));
      add.push({name,logo:ch.image||"",programs:list});
    }catch(e){console.warn(name,e.message);}
  }
  await Promise.all([rsi(356,"RSI 1"),rsi(357,"RSI 2")]);

  // --- merge safely ---
  for(const c of add){
    const i=out.findIndex(x=>clean(x.name)===clean(c.name));
    if(i>=0) out[i]={...out[i],...c}; else out.push(c);
  }

  await fs.writeFile("list.json",JSON.stringify(out,null,2));
  console.log("✅ merged",out.length,"channels");
}
main();

