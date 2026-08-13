const $ = q => document.querySelector(q);
const $$ = q => [...document.querySelectorAll(q)];

const SI = {length:1, force:1, moment:1, deflection:1, E:1, I:1, pos:1};
const IMP = {length:3.280839895, force:0.2248089439, moment:0.7375621493, deflection:0.03937007874, E:145.0377377, I:1/645.16, pos:3.280839895};
const clone = x => JSON.parse(JSON.stringify(x));
const kind = v => String(v ?? '').trim().toLowerCase().replaceAll(' ','_').replaceAll('-','_');
const fmt = (v,n=3) => Number(v).toFixed(n).replace(/\.0+$/,'').replace(/(\.\d*?)0+$/,'$1');
const esc = v => String(v).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');

const initialState = {
  spans: [{length:4,E:200,I:100000000}],
  supports: [{id:1,type:'fixed',position:0,settlement:0}],
  loads: [{id:1,type:'udl',value:8,value2:8,position:0,to:4}]
};
let state=clone(initialState), history=[], future=[];
let pyodide=null, solverReady=false, solving=false, lastResult=null;
let unit='SI', zoom=1, showValues=true, showFeatures=true, showDimensions=true, viewMode='select';
let collapsedAll=false;

function snapshot(){history.push(clone(state));if(history.length>60)history.shift();future=[];}
function restore(next){state=clone(next);lastResult=null;render();clearResults();}
function setError(msg){const el=$('#error');if(!el)return;el.textContent=msg;el.classList.toggle('hidden',!msg);}
function setValidation(msg){const el=$('#validation');if(!el)return;el.textContent=msg;el.classList.toggle('hidden',!msg);}
function totalLength(){return state.spans.reduce((s,x)=>s+Number(x.length||0),0);}
function factor(type){return unit==='SI'?SI[type]:IMP[type];}
function displayValue(v,type){return Number(v)*factor(type);}
function siValue(v,type){return Number(v)/factor(type);}
function unitLabel(type){if(unit==='SI'){return {length:'m',force:'kN',moment:'kN·m',deflection:'mm',E:'GPa',I:'mm⁴',pos:'m'}[type];}return {length:'ft',force:'kip',moment:'kip·ft',deflection:'in',E:'ksi',I:'in⁴',pos:'ft'}[type];}
function numberInput(v,type){return fmt(displayValue(v,type),type==='I'?2:3);}

function supportSymbol(type,x,y){
  if(type==='internal_hinge') return `<g><circle cx="${x}" cy="${y}" r="11" class="hinge-ring"/><circle cx="${x}" cy="${y}" r="4" class="hinge-core"/></g>`;
  if(type==='fixed') return `<g class="fixed-symbol"><line x1="${x}" y1="${y-28}" x2="${x}" y2="${y+28}"/><path d="M ${x-20} ${y-22} l20 -8 M ${x-20} ${y-8} l20 -8 M ${x-20} ${y+6} l20 -8 M ${x-20} ${y+20} l20 -8"/></g>`;
  const tri=`<path d="M ${x-18} ${y+20} L ${x} ${y-10} L ${x+18} ${y+20} Z" class="support-triangle"/>`;
  return type==='roller'?`${tri}<circle cx="${x-8}" cy="${y+25}" r="5" class="roller"/><circle cx="${x+8}" cy="${y+25}" r="5" class="roller"/>`:tri;
}

function renderInputs(){
  $('#spanRows').innerHTML=state.spans.map((s,i)=>`<tr><td>${i+1}</td><td><input type="number" step="any" data-span="${i}" data-field="length" value="${numberInput(s.length,'length')}"></td><td><input type="number" step="any" data-span="${i}" data-field="E" value="${numberInput(s.E,'E')}"></td><td><input type="number" step="any" data-span="${i}" data-field="I" value="${numberInput(s.I,'I')}"></td><td><button class="danger" data-remove-span="${i}">×</button></td></tr>`).join('');
  $('#supportRows').innerHTML=state.supports.map((s,i)=>`<tr><td>${i+1}</td><td><select data-support="${i}" data-field="type"><option value="pin" ${s.type==='pin'?'selected':''}>Pin</option><option value="roller" ${s.type==='roller'?'selected':''}>Roller</option><option value="fixed" ${s.type==='fixed'?'selected':''}>Fixed</option><option value="internal_hinge" ${s.type==='internal_hinge'?'selected':''}>Internal Hinge</option></select></td><td><input type="number" step="any" data-support="${i}" data-field="position" value="${numberInput(s.position,'pos')}"></td><td><input type="number" step="any" data-support="${i}" data-field="settlement" value="${numberInput(s.settlement||0,'deflection')}"></td><td><button class="danger" data-remove-support="${i}">×</button></td></tr>`).join('');
  $('#loadRows').innerHTML=state.loads.map((l,i)=>{const t=kind(l.type),u=t==='udl',p=t==='point'||t==='point_load';return `<tr><td>${i+1}</td><td>${u?'UDL / varying':t==='moment'?'Moment':'Point'}</td><td><input type="number" step="any" data-load="${i}" data-field="value" value="${numberInput(l.value,'force')}"></td><td>${u?`<input type="number" step="any" data-load="${i}" data-field="value2" value="${numberInput(l.value2??l.value,'force')}">`:'—'}</td><td>${p?`<input type="number" step="any" data-load="${i}" data-field="angle" value="${fmt(l.angle||0,2)}">`:'—'}</td><td><input type="number" step="any" data-load="${i}" data-field="position" value="${numberInput(l.position,'pos')}"></td><td>${u?`<input type="number" step="any" data-load="${i}" data-field="to" value="${numberInput(l.to,'pos')}">`:'—'}</td><td><button class="danger" data-remove-load="${i}">×</button></td></tr>`;}).join('');
  $$('[data-unit]').forEach(b=>b.classList.toggle('active',b.dataset.unit===unit));
}

function renderBeam(){
  const width=1100,height=270,pad=70,beamY=105,L=Math.max(totalLength(),1),sx=(width-2*pad)/L,X=p=>pad+Number(p)*sx;
  const supports=state.supports.map((s,i)=>{const x=X(s.position),name=s.type==='internal_hinge'?`H${i+1} · Internal Hinge`:`S${i+1} · ${s.type[0].toUpperCase()+s.type.slice(1)}`;return `<g>${supportSymbol(s.type,x,beamY)}<circle cx="${x}" cy="${beamY}" r="8" class="node"/><text x="${x}" y="${beamY+48}" class="support-label" text-anchor="middle">${esc(name)}</text><text x="${x}" y="${beamY+64}" class="position-label" text-anchor="middle">@ ${numberInput(s.position,'pos')} ${unitLabel('pos')}</text></g>`}).join('');
  const loads=state.loads.map(l=>{const x=X(l.position),t=kind(l.type);if(t==='moment')return `<g class="moment-load"><path d="M ${x+14} ${beamY-10} A 18 18 0 1 0 ${x-5} ${beamY-17}"/><text x="${x}" y="30" text-anchor="middle">${fmt(displayValue(l.value,'moment'))} ${unitLabel('moment')}</text></g>`;if(t==='udl'){const x2=X(l.to),label=(Number(l.value2??l.value)===Number(l.value)?`−${fmt(displayValue(l.value,'force'))}`:`−${fmt(displayValue(l.value,'force'))} → −${fmt(displayValue(l.value2,'force'))}`)+` ${unitLabel('force')}/${unitLabel('length')}`;let arrows='';for(let a=x;a<=x2+1;a+=Math.max(25,(x2-x)/12))arrows+=`<line x1="${a}" y1="55" x2="${a}" y2="${beamY-5}"/><path d="M ${a-4} ${beamY-11} L ${a} ${beamY-3} L ${a+4} ${beamY-11}"/>`;return `<g class="udl-load"><line x1="${x}" y1="55" x2="${x2}" y2="55"/><text x="${(x+x2)/2}" y="40" text-anchor="middle">${label}</text>${arrows}</g>`;}const angle=Number(l.angle||0);return `<g class="point-load"><line x1="${x}" y1="25" x2="${x}" y2="${beamY-4}"/><path d="M ${x-6} ${beamY-14} L ${x} ${beamY-3} L ${x+6} ${beamY-14}"/><text x="${x}" y="20" text-anchor="middle">−${fmt(displayValue(l.value,'force'))} ${unitLabel('force')}${angle?` @ ${angle}°`:''}</text></g>`;}).join('');
  const dims=showDimensions?`<line x1="${pad}" y1="${beamY+100}" x2="${width-pad}" y2="${beamY+100}" class="dimension-line"/><text x="${width/2}" y="${beamY+125}" class="dimension-text" text-anchor="middle">${numberInput(L,'length')} ${unitLabel('length')}</text>`:'';
  $('#beamCanvas').innerHTML=`<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Beam model">${loads}<line x1="${pad}" y1="${beamY}" x2="${width-pad}" y2="${beamY}" class="beam-line"/>${supports}${dims}</svg>`;
  $('#beamCanvas').style.transform=`scale(${zoom})`;$('#zoomValue').textContent=`${Math.round(zoom*100)}%`;
  $('#beamViewport').style.cursor=viewMode==='pan'?'grab':'default';
}
function render(){renderInputs();renderBeam();}

function clearResults(){
  $('#status').textContent='Waiting';$('#reactions').textContent='Run Analyze to calculate reactions.';$('#reactions').classList.add('empty');$('#hingeChecks').textContent='—';$('#hingeChecks').classList.add('empty');
  ['maxV','maxM','maxD'].forEach(id=>$('#'+id).textContent='—');['maxVPos','maxMPos','maxDPos'].forEach(id=>$('#'+id).textContent='—');
  ['sfd','bmd','deflection','rotation'].forEach(id=>$('#'+id).innerHTML='<div class="empty">Run Analyze to generate the diagram.</div>');$('#afd').textContent='No axial series.';
}

function niceScale(min,max){let span=max-min;if(!isFinite(span)||span===0){span=Math.max(1,Math.abs(max)||1);min-=span/2;max+=span/2}const p=span*.08;return [min-p,max+p]}
function chartData(samples,key){return samples.map(s=>({x:Number(s.x),y:Number(s[key])})).filter(p=>isFinite(p.x)&&isFinite(p.y));}
function nearestPoint(data,x){return data.reduce((a,b)=>Math.abs(b.x-x)<Math.abs(a.x-x)?b:a,data[0]);}

function renderChart(id,samples,key,label,type,features=[],jumps=[]){
  const el=$('#'+id);if(!samples?.length){el.innerHTML='<div class="empty">No data.</div>';return;}
  const data=chartData(samples,key), W=900,H=330,pad={l:58,r:28,t:28,b:50};let xmin=Math.min(...data.map(d=>d.x)),xmax=Math.max(...data.map(d=>d.x));let ymin=Math.min(...data.map(d=>d.y),0),ymax=Math.max(...data.map(d=>d.y),0);[ymin,ymax]=niceScale(ymin,ymax);
  const X=x=>pad.l+(x-xmin)/(xmax-xmin||1)*(W-pad.l-pad.r),Y=y=>H-pad.b-(y-ymin)/(ymax-ymin)*(H-pad.t-pad.b),zero=Y(0);
  const color={sfd:'#2d7ff0',bmd:'#20c9a6',deflection:'#ff9f00',rotation:'#e568f2'}[type]||'#2d7ff0';
  const areaClass={sfd:'chart-area-sfd',bmd:'chart-area-bmd',deflection:'chart-area-deflection',rotation:'chart-area-rotation'}[type]||'chart-area-sfd';
  const lineClass={sfd:'chart-line-sfd',bmd:'chart-line-bmd',deflection:'chart-line-deflection',rotation:'chart-line-rotation'}[type]||'chart-line-sfd';
  const path=data.map((d,i)=>`${i?'L':'M'} ${X(d.x).toFixed(2)} ${Y(d.y).toFixed(2)}`).join(' ');
  const area=`M ${X(data[0].x)} ${zero} L ${data.map(d=>`${X(d.x).toFixed(2)} ${Y(d.y).toFixed(2)}`).join(' L ')} L ${X(data[data.length-1].x)} ${zero} Z`;
  const grid=[];for(let i=0;i<=4;i++){const y=ymin+(ymax-ymin)*i/4;grid.push(`<line x1="${pad.l}" y1="${Y(y)}" x2="${W-pad.r}" y2="${Y(y)}" class="chart-grid"/><text x="${pad.l-9}" y="${Y(y)+4}" text-anchor="end" class="chart-label">${fmt(displayChartY(y,type),type==='rotation'?3:2)}</text>`)}for(let i=0;i<=4;i++){const x=xmin+(xmax-xmin)*i/4;grid.push(`<line x1="${X(x)}" y1="${pad.t}" x2="${X(x)}" y2="${H-pad.b}" class="chart-grid"/><text x="${X(x)}" y="${H-pad.b+25}" text-anchor="middle" class="chart-label">${fmt(displayValue(x,'pos'),2)}</text>`)}
  const featureXs=[...new Set(features.map(f=>Number(f.x)).filter(x=>isFinite(x)))];
  const featureLines=showFeatures?featureXs.map(x=>`<line x1="${X(x)}" y1="${pad.t}" x2="${X(x)}" y2="${H-pad.b}" class="chart-feature"/>`).join(''):'';
  const supports=showFeatures?features.filter(f=>f.support).map(f=>`<path d="M ${X(f.x)-7} ${zero+5} L ${X(f.x)} ${zero-7} L ${X(f.x)+7} ${zero+5} Z" class="chart-support"/>`).join(''):'';
  const loadLines=showFeatures?features.filter(f=>f.load).map(f=>`<line x1="${X(f.x)}" y1="${pad.t}" x2="${X(f.x)}" y2="${H-pad.b}" class="chart-loadline"/>`).join(''):'';
  const jumpLines=showFeatures?jumps.reduce((html,j,i)=>{if(j.side!=='left')return html;const right=jumps.find(k=>Math.abs(k.x-j.x)<1e-8&&k.side==='right');if(!right)return html;return html+`<line x1="${X(j.x)}" y1="${Y(j.y)}" x2="${X(j.x)}" y2="${Y(right.y)}" class="chart-loadline"/>`;},''):'';
  const max=data.reduce((a,b)=>Math.abs(b.y)>Math.abs(a.y)?b:a,data[0]);
  const maxLabel=`Max: ${fmt(displayChartY(max.y,type),type==='rotation'?3:3)} ${chartUnit(type)}`;
  let labels='';if(showValues){const chosen=[];features.forEach(f=>{const n=nearestPoint(data,Number(f.x));if(n)chosen.push(n)});[data[0],data[data.length-1],max,...chosen].forEach(n=>{if(n&&!chosen.some(c=>c.x===n.x)||n===max){labels+=`<text x="${X(n.x)}" y="${Y(n.y)-8}" text-anchor="middle" class="chart-value">${fmt(displayChartY(n.y,type),type==='rotation'?3:3)} ${chartUnit(type)}</text>`}})}
  const svg=`<div class="chartWrap"><svg class="chartSvg" viewBox="0 0 ${W} ${H}" data-chart="${id}" role="img" aria-label="${esc(label)}">${grid.join('')}<line x1="${pad.l}" y1="${zero}" x2="${W-pad.r}" y2="${zero}" class="chart-zero"/>${featureLines}${loadLines}${jumpLines}<path d="${area}" class="${areaClass}"/><path d="${path}" class="chart-line ${lineClass}" stroke="${color}"/>${supports}<circle cx="${X(max.x)}" cy="${Y(max.y)}" r="6" class="chart-max"/>${labels}<text x="${W-pad.r}" y="${H-10}" text-anchor="end" class="chart-label">Position (${unitLabel('pos')})</text><text x="${pad.l}" y="18" class="chart-label">${esc(label)} (${chartUnit(type)})</text><text x="${X(max.x)+9}" y="${Y(max.y)+4}" class="chart-value">${esc(maxLabel)}</text></svg><div class="chart-tooltip hidden"></div></div>`;
  el.innerHTML=svg;attachChartInteraction(el,data,type);
  if(lastResult?.poiX!=null)drawPoiMarker(el,lastResult.poiX,data,type);
}
function displayChartY(v,type){if(type==='deflection')return displayValue(v,'deflection');if(type==='rotation')return v;if(type==='bmd')return displayValue(v,'moment');return displayValue(v,'force');}
function chartUnit(type){return type==='deflection'?unitLabel('deflection'):type==='rotation'?'rad':type==='bmd'?unitLabel('moment'):unitLabel('force')}
function attachChartInteraction(el,data,type){const svg=el.querySelector('svg');const tip=el.querySelector('.chart-tooltip');if(!svg||!tip)return;svg.addEventListener('mousemove',ev=>{const r=svg.getBoundingClientRect(),x=(ev.clientX-r.left)/r.width*900;const pad={l:58,r:28},xmin=Math.min(...data.map(d=>d.x)),xmax=Math.max(...data.map(d=>d.x));const xx=xmin+(x-pad.l)/(900-pad.l-pad.r)*(xmax-xmin);const n=nearestPoint(data,Math.max(xmin,Math.min(xmax,xx)));tip.textContent=`x: ${fmt(displayValue(n.x,'pos'),3)} ${unitLabel('pos')} · ${fmt(displayChartY(n.y,type),4)} ${chartUnit(type)}`;tip.classList.remove('hidden');tip.style.left=`${Math.min(75,Math.max(2,(n.x-xmin)/(xmax-xmin)*100))}%`;tip.style.top='8px'});svg.addEventListener('mouseleave',()=>tip.classList.add('hidden'));svg.addEventListener('click',ev=>{const r=svg.getBoundingClientRect(),x=(ev.clientX-r.left)/r.width*900,pad={l:58,r:28},xmin=Math.min(...data.map(d=>d.x)),xmax=Math.max(...data.map(d=>d.x));const xx=xmin+(x-pad.l)/(900-pad.l-pad.r)*(xmax-xmin);lastResult=lastResult||{};lastResult.poiX=Math.max(xmin,Math.min(xmax,xx));renderAllCharts();});}
function drawPoiMarker(el,x,data,type){const svg=el.querySelector('svg');if(!svg)return;const old=svg.querySelector('.poi-marker');if(old)old.remove();const W=900,H=330,pad={l:58,r:28,t:28,b:50};const xmin=Math.min(...data.map(d=>d.x)),xmax=Math.max(...data.map(d=>d.x)),ymin=Math.min(...data.map(d=>d.y),0),ymax=Math.max(...data.map(d=>d.y),0);const xx=pad.l+(x-xmin)/(xmax-xmin||1)*(W-pad.l-pad.r),n=nearestPoint(data,x),yy=H-pad.b-(n.y-ymin)/(ymax-ymin||1)*(H-pad.t-pad.b);const ns=document.createElementNS('http://www.w3.org/2000/svg','circle');ns.setAttribute('cx',xx);ns.setAttribute('cy',yy);ns.setAttribute('r','5');ns.setAttribute('class','chart-poi poi-marker');svg.appendChild(ns);}

function buildFeatures(r){const out=[];(r?.reactions||[]).forEach(x=>out.push({x:Number(x.position),support:true}));(state.loads||[]).forEach(x=>out.push({x:Number(x.position),load:true}));(r?.hinge_checks||[]).forEach(x=>out.push({x:Number(x.position),support:true}));return out;}
function renderAllCharts(){if(!lastResult?.diagrams)return;const d=lastResult.diagrams.samples||[],f=buildFeatures(lastResult),j=lastResult.diagrams.jumps||[];renderChart('sfd',d,'shear_kN','Shear force','sfd',f,j);renderChart('bmd',d,'moment_kNm','Bending moment','bmd',f,j);renderChart('deflection',d,'deflection_mm','Deflection','deflection',f,[]);renderChart('rotation',d,'rotation_rad','Rotation / slope','rotation',f,[]);$('#afd').textContent='No axial series.';}

function showResults(r){
  lastResult=r;const d=r.diagrams?.samples||[];const maxAt=key=>{if(!d.length)return [0,0];const z=d.reduce((a,b)=>Math.abs(b[key])>Math.abs(a[key])?b:a,d[0]);return [Number(z[key]),Number(z.x)]};
  const [mv,xv]=maxAt('shear_kN'),[mm,xm]=maxAt('moment_kNm'),[md,xd]=maxAt('deflection_mm');
  $('#maxV').textContent=`${fmt(displayValue(Math.abs(mv),'force'),3)} ${unitLabel('force')}`;$('#maxVPos').textContent=`at ${fmt(displayValue(xv,'pos'),3)} ${unitLabel('pos')}`;
  $('#maxM').textContent=`${fmt(displayValue(Math.abs(mm),'moment'),3)} ${unitLabel('moment')}`;$('#maxMPos').textContent=`at ${fmt(displayValue(xm,'pos'),3)} ${unitLabel('pos')}`;
  $('#maxD').textContent=`${fmt(displayValue(Math.abs(md),'deflection'),3)} ${unitLabel('deflection')}`;$('#maxDPos').textContent=`at ${fmt(displayValue(xd,'pos'),3)} ${unitLabel('pos')}`;
  $('#reactions').classList.remove('empty');$('#reactions').innerHTML=`<table><thead><tr><th>#</th><th>Type</th><th>Position</th><th>Vertical (${unitLabel('force')})</th><th>Moment (${unitLabel('moment')})</th></tr></thead><tbody>${(r.reactions||[]).map(x=>`<tr><td>${x.index}</td><td>${String(x.type).replaceAll('_',' ')}</td><td>${fmt(displayValue(x.position,'pos'),3)}</td><td>${fmt(displayValue(x.vertical_kN,'force'),3)}</td><td>${fmt(displayValue(x.moment_kNm,'moment'),3)}</td></tr>`).join('')}</tbody></table>`;
  const hc=r.hinge_checks||[];$('#hingeChecks').classList.toggle('empty',!hc.length);$('#hingeChecks').innerHTML=hc.length?`<table><thead><tr><th>Position</th><th>Left M</th><th>Right M</th></tr></thead><tbody>${hc.map(h=>`<tr><td>${fmt(displayValue(h.position,'pos'),3)} ${unitLabel('pos')}</td><td>${fmt(displayValue(h.left_moment_kNm,'moment'),4)} ${unitLabel('moment')}</td><td>${fmt(displayValue(h.right_moment_kNm,'moment'),4)} ${unitLabel('moment')}</td></tr>`).join('')}</tbody></table>`:'No internal hinges.';
  $('#status').textContent='Solved';$('#engineStatus').textContent='Python engine ready';renderAllCharts();
}

function prepareAnalysisModel(){
  const m=clone(state),out=[];
  for(const l of m.loads){const t=kind(l.type);if(t==='point'||t==='point_load'){const angle=Number(l.angle||0);out.push({...l,value:Number(l.value)*Math.cos(angle*Math.PI/180),angle:0});}else if(t==='udl'||t==='distributed'||t==='uniform'){const a=Number(l.position),b=Number(l.to),q0=Number(l.value),q1=Number(l.value2??l.value),n=Math.max(12,Math.min(48,Math.ceil(Math.abs(b-a)*4)));for(let i=0;i<n;i++){const x0=a+(b-a)*i/n,x1=a+(b-a)*(i+1)/n,qm=q0+(q1-q0)*(i+.5)/n;out.push({type:'udl',value:qm,value2:qm,position:x0,to:x1,id:`${l.id||i}-${i}`});}}else out.push(l);}m.loads=out;return m;
}
async function initPython(){try{if(typeof loadPyodide!=='function')throw Error('Pyodide could not be loaded.');pyodide=await loadPyodide({indexURL:'https://cdn.jsdelivr.net/pyodide/v0.26.4/full/'});await pyodide.loadPackage('numpy');const [solverText,diagramText]=await Promise.all([fetch('backend/solver.py').then(r=>{if(!r.ok)throw Error('Could not load Python solver');return r.text()}),fetch('backend/diagrams.py').then(r=>{if(!r.ok)throw Error('Could not load diagram engine');return r.text()})]);pyodide.FS.writeFile('/home/solver.py',solverText);pyodide.FS.writeFile('/home/diagrams.py',diagramText);pyodide.runPython("import sys; sys.path.insert(0,'/home')");pyodide.runPython('import solver, diagrams');solverReady=true;$('#engineStatus').textContent='Python engine ready';$('#status').textContent='Ready';}catch(e){solverReady=false;$('#engineStatus').textContent='Python engine failed';setError(e.message||String(e));}}
async function evaluate(){if(solving)return;if(!solverReady){setError('Python engine is still loading. Wait for “Python engine ready”.');return}setError('');setValidation('');solving=true;$('#analyzeBtn').disabled=true;$('#analyzeBtn').textContent='⏳ Analyzing…';$('#status').textContent='Solving…';try{const model=prepareAnalysisModel();pyodide.globals.set('model_json',JSON.stringify(model));const raw=await pyodide.runPythonAsync(`import json\nmodel=json.loads(model_json)\nr=solver.solve_beam(model)\nr["diagrams"]=diagrams.build_diagrams(model,r)\njson.dumps(r)`);showResults(JSON.parse(raw));}catch(e){$('#status').textContent='Error';setError(e.message||String(e));}finally{solving=false;$('#analyzeBtn').disabled=false;$('#analyzeBtn').textContent='▶ Analyze';}}

function saveFile(){const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='beamlab-model.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
function loadFile(file){if(!file)return;const r=new FileReader();r.onload=()=>{try{const data=JSON.parse(r.result);if(!Array.isArray(data.spans)||!Array.isArray(data.supports)||!Array.isArray(data.loads))throw Error('Invalid BeamLab model file');snapshot();state=data;lastResult=null;render();clearResults();setError('')}catch(e){setError(e.message)}};r.readAsText(file)}
function share(){const text='Beam Analyzer model: '+JSON.stringify(state);if(navigator.share)navigator.share({title:'Beam Analyzer model',text,url:location.href}).catch(()=>{});else navigator.clipboard?.writeText(text).then(()=>setValidation('Model copied to clipboard.')).catch(()=>setValidation('Share is not available in this browser.'))}
function newModel(){snapshot();state={spans:[{length:8,E:200,I:100000000}],supports:[{id:1,type:'pin',position:0,settlement:0},{id:2,type:'roller',position:8,settlement:0}],loads:[]};lastResult=null;render();clearResults();setError('');}
function addSpan(){snapshot();const L=totalLength();state.spans.push({length:4,E:200,I:100000000});render();setValidation(`Added a 4 ${unitLabel('length')} span. Update support/load positions as needed.`)}
function addSupport(){snapshot();state.supports.push({id:Date.now(),type:'roller',position:totalLength()/2,settlement:0});render()}
function addLoad(type){snapshot();const L=totalLength();if(type==='point')state.loads.push({id:Date.now(),type:'point',value:10,position:L/2,angle:0});else if(type==='udl')state.loads.push({id:Date.now(),type:'udl',value:5,value2:5,position:0,to:L});else state.loads.push({id:Date.now(),type:'moment',value:10,position:L/2});render()}
function applyExample(name){snapshot();if(name==='simple'){state={spans:[{length:8,E:200,I:100000000}],supports:[{id:1,type:'pin',position:0,settlement:0},{id:2,type:'roller',position:8,settlement:0}],loads:[{id:1,type:'point',value:10,position:4,angle:0}]};}else if(name==='udl'){state={spans:[{length:6,E:200,I:100000000}],supports:[{id:1,type:'pin',position:0,settlement:0},{id:2,type:'roller',position:6,settlement:0}],loads:[{id:1,type:'udl',value:10,value2:10,position:0,to:6}]};}else{state={spans:[{length:4,E:200,I:100000000}],supports:[{id:1,type:'fixed',position:0,settlement:0}],loads:[{id:1,type:'point',value:20,position:4,angle:0}]};}lastResult=null;render();clearResults();setValidation(`Loaded ${name} example. Click Analyze.`)}

function handleInputChange(e){const t=e.target;if(t.dataset.span!=null){const i=+t.dataset.span,field=t.dataset.field;state.spans[i][field]=siValue(Number(t.value),field==='length'?'length':field==='E'?'E':'I');}else if(t.dataset.support!=null){const i=+t.dataset.support,field=t.dataset.field;state.supports[i][field]=field==='type'?t.value:siValue(Number(t.value),field==='settlement'?'deflection':'pos');}else if(t.dataset.load!=null){const i=+t.dataset.load,field=t.dataset.field;state.loads[i][field]=field==='angle'?Number(t.value):siValue(Number(t.value),field==='position'||field==='to'?'pos':'force');}lastResult=null;renderBeam();}
function handleChange(e){if(e.target.matches('[data-span],[data-support],[data-load]')){snapshot();handleInputChange(e);}}
function undo(){if(!history.length)return;future.push(clone(state));state=history.pop();lastResult=null;render();clearResults()}
function redo(){if(!future.length)return;history.push(clone(state));state=future.pop();lastResult=null;render();clearResults()}
function toggleTheme(){const dark=document.body.classList.toggle('dark');document.body.classList.toggle('light',!dark);localStorage.setItem('beamlab-theme',dark?'dark':'light')}
function toggleValues(){showValues=!showValues;$('#valueToggle').classList.toggle('active',showValues);if(lastResult)renderAllCharts()}
function toggleFeatures(){showFeatures=$('#featureToggle').checked;if(lastResult)renderAllCharts()}
function collapseAll(){collapsedAll=!collapsedAll;$$('.chartBox').forEach(x=>x.classList.toggle('collapsed',collapsedAll));$$('.diagramCollapse').forEach(x=>x.textContent=collapsedAll?'Expand':'Collapse');$('#collapseBtn').textContent=collapsedAll?'Expand all':'Collapse all'}
function toggleOne(btn){const box=btn.closest('.diagramBlock').querySelector('.chartBox');box.classList.toggle('collapsed');btn.textContent=box.classList.contains('collapsed')?'Expand':'Collapse'}
function evaluatePoi(){if(!lastResult?.diagrams?.samples?.length){setValidation('Analyze the beam first.');return}const x=siValue(Number($('#poi').value),'pos');if(!isFinite(x)||x<0||x>totalLength()){setValidation(`X position must be between 0 and ${numberInput(totalLength(),'length')} ${unitLabel('length')}.`);return}lastResult.poiX=x;const n=nearestPoint(lastResult.diagrams.samples.map(s=>({x:Number(s.x),y:Number(s.moment_kNm)})),x);const d=nearestPoint(lastResult.diagrams.samples.map(s=>({x:Number(s.x),y:Number(s.deflection_mm)})),x);const v=nearestPoint(lastResult.diagrams.samples.map(s=>({x:Number(s.x),y:Number(s.shear_kN)})),x);$('#poiOut').innerHTML=`<strong>x = ${fmt(displayValue(x,'pos'),3)} ${unitLabel('pos')}</strong><br>V = ${fmt(displayValue(v.y,'force'),3)} ${unitLabel('force')} · M = ${fmt(displayValue(n.y,'moment'),3)} ${unitLabel('moment')} · δ = ${fmt(displayValue(d.y,'deflection'),3)} ${unitLabel('deflection')}`;renderAllCharts()}
function report(){if(!lastResult){setValidation('Analyze the beam before printing a report.');return}window.print()}

let panStart=null;function setupPan(){const vp=$('#beamViewport');vp.addEventListener('pointerdown',e=>{if(viewMode!=='pan')return;panStart={x:e.clientX,y:e.clientY,sl:vp.scrollLeft,st:vp.scrollTop};vp.setPointerCapture(e.pointerId)});vp.addEventListener('pointermove',e=>{if(!panStart)return;vp.scrollLeft=panStart.sl-(e.clientX-panStart.x);vp.scrollTop=panStart.st-(e.clientY-panStart.y)});vp.addEventListener('pointerup',()=>panStart=null);}

function bind(){
  $('#analyzeBtn').addEventListener('click',evaluate);$('#newBtn').addEventListener('click',newModel);$('#saveBtn').addEventListener('click',saveFile);$('#loadInput').addEventListener('change',e=>loadFile(e.target.files[0]));$('#shareBtn').addEventListener('click',share);$('#themeBtn').addEventListener('click',toggleTheme);
  $('#addSpan').addEventListener('click',addSpan);$('#addSupport').addEventListener('click',addSupport);$$('[data-add-load]').forEach(b=>b.addEventListener('click',()=>addLoad(b.dataset.addLoad)));$('#undoBtn').addEventListener('click',undo);$('#redoBtn').addEventListener('click',redo);
  $('#valueToggle').addEventListener('click',toggleValues);$('#featureToggle').addEventListener('change',toggleFeatures);$('#collapseBtn').addEventListener('click',collapseAll);$$('.diagramCollapse').forEach(b=>b.addEventListener('click',()=>toggleOne(b)));
  $('#poiBtn').addEventListener('click',evaluatePoi);$('#reportBtn').addEventListener('click',report);$$('.example').forEach(b=>b.addEventListener('click',()=>applyExample(b.dataset.example)));
  $('#zoomIn').addEventListener('click',()=>{zoom=Math.min(2,zoom+.1);renderBeam()});$('#zoomOut').addEventListener('click',()=>{zoom=Math.max(.5,zoom-.1);renderBeam()});$('#resetView').addEventListener('click',()=>{zoom=1;$('#beamViewport').scrollLeft=0;$('#beamViewport').scrollTop=0;renderBeam()});$('#dimsBtn').addEventListener('click',()=>{showDimensions=!showDimensions;$('#dimsBtn').classList.toggle('active',showDimensions);renderBeam()});
  $$('[data-view]').forEach(b=>b.addEventListener('click',()=>{viewMode=b.dataset.view;$$('[data-view]').forEach(x=>x.classList.toggle('active',x===b));$('#beamViewport').style.cursor=viewMode==='pan'?'grab':'default'}));
  $$('[data-unit]').forEach(b=>b.addEventListener('click',()=>{unit=b.dataset.unit;render();if(lastResult)showResults(lastResult)}));
  document.addEventListener('input',e=>{if(e.target.matches('[data-span],[data-support],[data-load]'))handleInputChange(e)});document.addEventListener('change',handleChange);
  document.addEventListener('click',e=>{const b=e.target.closest('[data-remove-span],[data-remove-support],[data-remove-load]');if(!b)return;snapshot();if(b.dataset.removeSpan!=null)state.spans.splice(+b.dataset.removeSpan,1);else if(b.dataset.removeSupport!=null)state.supports.splice(+b.dataset.removeSupport,1);else state.loads.splice(+b.dataset.removeLoad,1);render();lastResult=null;clearResults()});
  setupPan();
}

(function start(){const saved=localStorage.getItem('beamlab-theme');if(saved==='dark'){document.body.classList.add('dark');document.body.classList.remove('light')}bind();render();clearResults();initPython()})();
