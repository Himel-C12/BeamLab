/* BeamLab live solving + AI beam overview */
(()=>{
  const $=q=>document.querySelector(q);
  const style=document.createElement('style');
  style.textContent=`
    .diagramGrid{display:grid!important;grid-template-columns:1fr!important;gap:14px!important}.diagramBlock{width:100%}
    .aiOverview{margin-top:14px;border:1px solid #dce3eb;border-radius:14px;padding:18px 20px;background:linear-gradient(135deg,rgba(47,127,230,.055),rgba(126,55,139,.035));box-shadow:0 6px 24px rgba(25,43,65,.045)}
    .aiOverviewHead{display:flex;align-items:center;gap:10px;margin-bottom:8px}.aiBadge{font-size:10px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;padding:4px 8px;border-radius:999px;background:#edf5ff;color:#1768d1;border:1px solid #c9dfff}.aiOverview h2{margin:0;font-size:16px}.aiOverview p{margin:8px 0 0;color:#596576;line-height:1.65}.aiFacts{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:12px}.aiFact{padding:10px 12px;border:1px solid #e1e7ef;border-radius:10px;background:rgba(255,255,255,.7)}.aiFact strong{display:block;font-size:10px;color:#718096;text-transform:uppercase;letter-spacing:.04em}.aiFact span{display:block;margin-top:3px;font-weight:700;line-height:1.35}.aiInsight{margin-top:12px;padding:12px 14px;border-left:3px solid #2d7ff0;border-radius:9px;background:rgba(45,127,240,.055);color:#4f5e70;line-height:1.6}.aiInsight strong{color:#243447}.aiSections{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-top:12px}.aiSection{padding:12px 14px;border:1px solid #e1e7ef;border-radius:10px;background:rgba(255,255,255,.45)}.aiSection h4{margin:0 0 5px;font-size:11px;text-transform:uppercase;letter-spacing:.05em}.aiSection p{margin:0;font-size:13px;line-height:1.55}
    @media(max-width:850px){.aiFacts,.aiSections{grid-template-columns:1fr 1fr}}@media(max-width:700px){.aiFacts,.aiSections{grid-template-columns:1fr}}
    body.dark .aiOverview{border-color:rgba(255,255,255,.10);background:linear-gradient(135deg,rgba(50,95,150,.13),rgba(120,60,145,.08));box-shadow:0 18px 45px rgba(0,0,0,.18)}body.dark .aiOverview p{color:#a0adbd}body.dark .aiFact,body.dark .aiSection{border-color:rgba(255,255,255,.08);background:rgba(255,255,255,.025)}body.dark .aiFact strong{color:#8995a7}body.dark .aiBadge{background:rgba(35,74,125,.42);border-color:rgba(80,150,255,.45);color:#79b3ff}body.dark .aiInsight{background:rgba(45,127,240,.10);color:#aeb9c7}body.dark .aiInsight strong{color:#dbe7f5}
  `;document.head.appendChild(style);

  let pending=false,lastStateRef=null;
  const queue=()=>{pending=true};
  document.addEventListener('input',e=>{if(e.target.matches('[data-span],[data-support],[data-load]'))queue()});
  document.addEventListener('change',e=>{if(e.target.matches('[data-span],[data-support],[data-load]'))queue()});
  document.addEventListener('click',e=>{if(e.target.closest('#addSpan,#addSupport,[data-add-load],#newBtn,#undoBtn,#redoBtn,.example,[data-remove-span],[data-remove-support],[data-remove-load]'))queue()});

  setInterval(()=>{try{if(pending&&typeof solverReady!=='undefined'&&solverReady&&typeof solving!=='undefined'&&!solving&&typeof evaluate==='function'){pending=false;evaluate()}}catch(e){console.warn('BeamLab live solve:',e)}},120);
  const boot=setInterval(()=>{try{if(typeof solverReady!=='undefined'&&solverReady){clearInterval(boot);pending=true}}catch(e){}},150);

  function overview(){
    const spans=state?.spans||[],supports=state?.supports||[],loads=state?.loads||[],L=spans.reduce((s,x)=>s+Number(x.length||0),0);
    const fixed=supports.filter(s=>s.type==='fixed').length,pins=supports.filter(s=>s.type==='pin').length,rollers=supports.filter(s=>s.type==='roller').length,hinges=supports.filter(s=>s.type==='internal_hinge').length;
    const pointLoads=loads.filter(l=>['point','point_load'].includes(String(l.type).toLowerCase())),udlLoads=loads.filter(l=>['udl','distributed','uniform'].includes(String(l.type).toLowerCase())),momentLoads=loads.filter(l=>String(l.type).toLowerCase()==='moment');
    let name='beam',use='a structural member that carries load and transfers it to its supports';
    if(fixed===1&&supports.length===1){name='cantilever beam';use='balconies, canopies, projecting slabs, sign supports, and other members restrained at one end'}
    else if(fixed===1&&supports.length>1){name='propped cantilever';use='members with one fixed end and an additional support'}
    else if(fixed===2&&supports.length===2){name='fixed-ended beam';use='rigidly restrained members where both ends develop support moments'}
    else if(pins===1&&rollers===1&&supports.length===2){name='simply supported beam';use='floor beams, bridge girders, and common laboratory beam models where the ends can rotate'}
    else if(hinges>0){name='internally hinged beam';use='members containing a release that permits rotation and makes the bending moment zero at the hinge'}
    else if(supports.length>2){name='continuous beam';use='floor and bridge systems running over more than two supports'}
    else if(fixed>0){name='restrained beam';use='members where rotational restraint changes support moments and deformation'}

    const loadText=[];
    if(pointLoads.length)loadText.push(`${pointLoads.length} point load${pointLoads.length>1?'s':''}`);
    if(udlLoads.length)loadText.push(`${udlLoads.length} distributed load${udlLoads.length>1?'s':''}`);
    if(momentLoads.length)loadText.push(`${momentLoads.length} applied moment${momentLoads.length>1?'s':''}`);
    const loadPhrase=loadText.length?loadText.join(', '):'no applied loads yet';

    let maxV=null,maxM=null,maxD=null;
    const d=lastResult?.diagrams?.samples||[];
    if(d.length){maxV=d.reduce((a,b)=>Math.abs(Number(b.shear_kN))>Math.abs(Number(a.shear_kN))?b:a,d[0]);maxM=d.reduce((a,b)=>Math.abs(Number(b.moment_kNm))>Math.abs(Number(a.moment_kNm))?b:a,d[0]);maxD=d.reduce((a,b)=>Math.abs(Number(b.deflection_mm))>Math.abs(Number(a.deflection_mm))?b:a,d[0]);}
    const posUnit=typeof unitLabel==='function'?unitLabel('pos'):'m',lenUnit=typeof unitLabel==='function'?unitLabel('length'):'m';
    const f=x=>`${Math.abs(Number(x)).toFixed(2)} ${typeof unitLabel==='function'?unitLabel('force'):'kN'}`;
    const m=x=>`${Math.abs(Number(x)).toFixed(2)} ${typeof unitLabel==='function'?unitLabel('moment'):'kN·m'}`;
    const p=x=>`${Number(x).toFixed(2)} ${posUnit}`;

    let supportStory='';
    if(name==='simply supported beam')supportStory='The pin restrains horizontal and vertical movement, the roller restrains vertical movement, and both ends are free to rotate. That is why this is such a useful idealization for floor beams and bridge girders.';
    else if(name==='cantilever beam')supportStory='The fixed end restrains both translation and rotation. The restraint creates the support actions that control the beam response, so the fixed end is usually a critical region.';
    else if(name==='fixed-ended beam')supportStory='Both ends restrain rotation, so the beam can develop end moments. Its behavior is therefore quite different from a simply supported beam.';
    else if(name==='internally hinged beam')supportStory='The internal hinge releases bending moment while allowing rotation. In a correct solution, the bending moment at the hinge should be zero.';
    else supportStory=`The ${name} behavior comes directly from the support arrangement in this model.`;

    const loadStories=[];
    if(pointLoads.length)loadStories.push('<strong>Point loads</strong> create abrupt changes in the SFD at their application points.');
    if(udlLoads.length){const varying=udlLoads.some(l=>Math.abs(Number(l.value2??l.value)-Number(l.value))>1e-9);loadStories.push(varying?'<strong>Varying distributed loading</strong> makes the shear and moment curves change shape along the loaded region.':'<strong>Uniform distributed loading</strong> produces a linear SFD and a parabolic BMD over the loaded region.');}
    if(momentLoads.length)loadStories.push('<strong>Applied moments</strong> produce a jump in the BMD but do not produce a corresponding jump in the SFD.');
    if(pointLoads.some(l=>Math.abs(Number(l.angle||0))>1e-9))loadStories.push('<strong>Angled point loads</strong> contain horizontal and vertical components, so they can affect both axial force and bending response.');
    if(!loadStories.length)loadStories.push('<strong>No loading yet.</strong> Add a load and this briefing will explain the structural behavior it introduces.');

    let resultStory='The solver has not produced a result yet.';
    if(maxV&&maxM&&maxD){resultStory=`The current solution gives |V|max ≈ ${f(maxV.shear_kN)} at x ≈ ${p(maxV.x)}, |M|max ≈ ${m(maxM.moment_kNm)} at x ≈ ${p(maxM.x)}, and |δ|max ≈ ${Math.abs(Number(maxD.deflection_mm)).toFixed(2)} ${typeof unitLabel==='function'?unitLabel('deflection'):'mm'} at x ≈ ${p(maxD.x)}.`;if(Math.abs(Number(maxM.x)-Number(maxD.x))<Math.max(L*.08,.05))resultStory+=' The maximum moment and deflection are close together, which is a useful clue about the beam’s critical region.';else resultStory+=' It is normal for the maximum moment and maximum deflection to occur at different locations.';}

    let fact='Engineering fact: the slope of the BMD is the shear force, while the change in shear is governed by distributed loading. The shapes of the diagrams therefore tell you something about the loads, not just the final numbers.';
    if(udlLoads.length)fact=udlLoads.some(l=>Math.abs(Number(l.value2??l.value)-Number(l.value))>1e-9)?'Engineering fact: a linearly varying load gives a curved shear diagram and a higher-order bending-moment curve.':'Engineering fact: under a uniform distributed load, shear varies linearly and bending moment varies parabolically.';
    else if(pointLoads.length)fact='Engineering fact: a concentrated force causes a shear jump, while the bending-moment diagram stays continuous unless a concentrated moment is applied there too.';
    else if(momentLoads.length)fact='Engineering fact: a concentrated applied moment changes the BMD directly without creating a distributed shear force.';

    return {name,use,L,supports:supports.length,loads:loadPhrase,supportStory,loadStory:loadStories.join(' '),resultStory,fact,lenUnit};
  }

  function renderOverview(){
    const host=$('#aiOverview');if(!host)return;
    const o=overview();
    host.innerHTML=`<div class="aiOverviewHead"><span class="aiBadge">AI structural briefing</span><h2>Your beam, decoded</h2></div><p><strong>Do you know this beam is called a ${o.name}?</strong> ${o.use.charAt(0).toUpperCase()+o.use.slice(1)}. This model is ${o.L.toFixed(2)} ${o.lenUnit} long with ${o.supports} support${o.supports===1?'':'s'} and ${o.loads}. ${o.supportStory}</p><div class="aiInsight"><strong>What is interesting about this particular beam?</strong> ${o.loadStory}</div><div class="aiSections"><div class="aiSection"><h4>What the solution says</h4><p>${o.resultStory}</p></div><div class="aiSection"><h4>Engineering fact</h4><p>${o.fact}</p></div></div><div class="aiFacts"><div class="aiFact"><strong>Beam type</strong><span>${o.name}</span></div><div class="aiFact"><strong>Span</strong><span>${o.L.toFixed(2)} ${o.lenUnit}</span></div><div class="aiFact"><strong>Supports</strong><span>${o.supports}</span></div><div class="aiFact"><strong>Loading</strong><span>${o.loads}</span></div></div>`;
  }

  const status=$('#status');
  const observer=new MutationObserver(()=>{if(status?.textContent==='Solved')renderOverview()});
  if(status)observer.observe(status,{childList:true,characterData:true,subtree:true});
  setInterval(()=>{try{if(lastStateRef!==state){lastStateRef=state;renderOverview()}}catch(e){}},250);
  renderOverview();
})();
