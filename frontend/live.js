/* BeamLab live solving + AI beam overview */
(()=>{
  const $=q=>document.querySelector(q);
  const style=document.createElement('style');
  style.textContent=`
    .diagramGrid{display:grid!important;grid-template-columns:1fr!important;gap:14px!important}.diagramBlock{width:100%}
    .aiOverview{margin-top:14px;border:1px solid #dce3eb;border-radius:14px;padding:18px 20px;background:linear-gradient(135deg,rgba(47,127,230,.055),rgba(126,55,139,.035));box-shadow:0 6px 24px rgba(25,43,65,.045)}
    .aiOverviewHead{display:flex;align-items:center;gap:10px;margin-bottom:8px}.aiBadge{font-size:10px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;padding:4px 8px;border-radius:999px;background:#edf5ff;color:#1768d1;border:1px solid #c9dfff}.aiOverview h2{margin:0;font-size:16px}.aiOverview p{margin:8px 0 0;color:#596576;line-height:1.65}.aiFacts{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:12px}.aiFact{padding:10px 12px;border:1px solid #e1e7ef;border-radius:10px;background:rgba(255,255,255,.7)}.aiFact strong{display:block;font-size:10px;color:#718096;text-transform:uppercase;letter-spacing:.04em}.aiFact span{display:block;margin-top:3px;font-weight:700}
    @media(max-width:700px){.aiFacts{grid-template-columns:1fr}}body.dark .aiOverview{border-color:rgba(255,255,255,.10);background:linear-gradient(135deg,rgba(50,95,150,.13),rgba(120,60,145,.08));box-shadow:0 18px 45px rgba(0,0,0,.18)}body.dark .aiOverview p{color:#a0adbd}body.dark .aiFact{border-color:rgba(255,255,255,.08);background:rgba(255,255,255,.025)}body.dark .aiFact strong{color:#8995a7}body.dark .aiBadge{background:rgba(35,74,125,.42);border-color:rgba(80,150,255,.45);color:#79b3ff}
  `;document.head.appendChild(style);

  let pending=false,lastStateRef=null,retryTimer=null;
  const queue=()=>{pending=true};
  document.addEventListener('input',e=>{if(e.target.matches('[data-span],[data-support],[data-load]'))queue()});
  document.addEventListener('change',e=>{if(e.target.matches('[data-span],[data-support],[data-load]'))queue()});
  document.addEventListener('click',e=>{
    if(e.target.closest('#addSpan,#addSupport,[data-add-load],#newBtn,#undoBtn,#redoBtn,.example,[data-remove-span],[data-remove-support],[data-remove-load]')){
      queue();
      // Adding/removing a structural item rebuilds the inputs and SVG first.
      // Give that synchronous render a chance to settle before the first solve.
      clearTimeout(retryTimer);
      retryTimer=setTimeout(queue,180);
    }
  });

  // A failed first solve used to clear `pending` before evaluate() completed.
  // If the newly-added UDL was still settling, that transient failure was then
  // never retried until the user edited another field. Keep the request pending
  // until evaluate() has actually completed, and retry a short-lived transient
  // failure automatically.
  const runPending=()=>{
    if(!pending||typeof solverReady==='undefined'||!solverReady||typeof solving==='undefined'||solving||typeof evaluate!=='function')return;
    pending=false;
    try{
      const result=evaluate();
      if(result&&typeof result.then==='function'){
        result.catch(err=>{pending=true;console.warn('BeamLab live solve retry:',err)});
      }
    }catch(e){
      pending=true;
      console.warn('BeamLab live solve retry:',e);
    }
  };
  setInterval(runPending,120);
  const boot=setInterval(()=>{try{if(typeof solverReady!=='undefined'&&solverReady){clearInterval(boot);pending=true}}catch(e){}},150);

  function overview(){
    const spans=state?.spans||[],supports=state?.supports||[],loads=state?.loads||[],L=spans.reduce((s,x)=>s+Number(x.length||0),0);
    const fixed=supports.filter(s=>s.type==='fixed').length,pins=supports.filter(s=>s.type==='pin').length,rollers=supports.filter(s=>s.type==='roller').length,hinges=supports.filter(s=>s.type==='internal_hinge').length;
    const points=loads.filter(l=>['point','point_load'].includes(String(l.type).toLowerCase())).length,udls=loads.filter(l=>['udl','distributed','uniform'].includes(String(l.type).toLowerCase())).length,moments=loads.filter(l=>String(l.type).toLowerCase()==='moment').length;
    let name='beam',use='general structural members that carry transverse loads and transfer them to supports';
    if(fixed===1&&supports.length===1){name='cantilever beam';use='balconies, canopies, projecting slabs, sign supports, and other members fixed at one end'}
    else if(pins===1&&rollers===1&&supports.length===2){name='simply supported beam';use='floor beams, bridge girders, and other members supported at two ends where rotation is allowed at the supports'}
    else if(hinges>0){name='internally hinged beam';use='structures where an internal release allows rotation while carrying shear and axial force without bending moment across the hinge'}
    else if(supports.length>2){name='continuous beam';use='floor systems and bridge members spanning over multiple supports to distribute bending between spans'}
    else if(fixed>0){name='fixed or restrained beam';use='members where rotational restraint develops support moments and reduces end rotation'}
    const loadText=[];if(points)loadText.push(`${points} point load${points>1?'s':''}`);if(udls)loadText.push(`${udls} distributed load${udls>1?'s':''}`);if(moments)loadText.push(`${moments} applied moment${moments>1?'s':''}`);const loadPhrase=loadText.length?loadText.join(', '):'no applied loads yet';
    let insight='The model is ready for structural interpretation. Change any input and the solution will update automatically.';
    if(lastResult?.diagrams?.samples?.length){const d=lastResult.diagrams.samples,maxV=d.reduce((a,b)=>Math.abs(b.shear_kN)>Math.abs(a.shear_kN)?b:a,d[0]),maxM=d.reduce((a,b)=>Math.abs(b.moment_kNm)>Math.abs(a.moment_kNm)?b:a,d[0]),maxD=d.reduce((a,b)=>Math.abs(b.deflection_mm)>Math.abs(a.deflection_mm)?b:a,d[0]);const posUnit=typeof unitLabel==='function'?unitLabel('pos'):'m';insight=`From the current solution, the strongest shear occurs around x = ${Number(maxV.x).toFixed(2)} ${posUnit}, the largest bending moment around x = ${Number(maxM.x).toFixed(2)} ${posUnit}, and the largest calculated deflection around x = ${Number(maxD.x).toFixed(2)} ${posUnit}. That gives you a quick structural story before you inspect each diagram in detail.`}
    return {name,use,L,supports:supports.length,loads:loadPhrase,insight};
  }
  function renderOverview(){const host=$('#aiOverview');if(!host)return;const o=overview(),lenUnit=typeof unitLabel==='function'?unitLabel('length'):'m';host.innerHTML=`<div class="aiOverviewHead"><span class="aiBadge">AI overview</span><h2>What your beam is telling you</h2></div><p><strong>Do you know this beam is called a ${o.name}?</strong> This type of beam can be used for ${o.use}. In your current model, the total beam length is ${o.L.toFixed(2)} ${lenUnit}, with ${o.supports} support${o.supports===1?'':'s'} and ${o.loads}. ${o.insight}</p><div class="aiFacts"><div class="aiFact"><strong>Structural type</strong><span>${o.name}</span></div><div class="aiFact"><strong>Total span</strong><span>${o.L.toFixed(2)} ${lenUnit}</span></div><div class="aiFact"><strong>Loading</strong><span>${o.loads}</span></div></div>`}

  const status=$('#status');
  const observer=new MutationObserver(()=>{if(status?.textContent==='Solved')renderOverview()});
  if(status)observer.observe(status,{childList:true,characterData:true,subtree:true});
  setInterval(()=>{try{if(lastStateRef!==state){lastStateRef=state;renderOverview()}}catch(e){}},250);
  renderOverview();
})();
