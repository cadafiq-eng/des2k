/* Módulos de pooling, potencia prospectiva y preferencia de tema. */
(function(){
'use strict';
const $=id=>document.getElementById(id), S=Stats, A=Analysis, D=Design;
const themes=['system','light','dark'], labels=['sistema','día','noche'];
let theme='system'; try {theme=localStorage.getItem('doe2k-theme')||theme;}catch(e){}
function applyTheme(){document.documentElement.dataset.theme=theme; $('themeToggle').textContent='Tema: '+labels[themes.indexOf(theme)];window.dispatchEvent(new Event('resize'));}
if(!themes.includes(theme))theme='system';
$('themeToggle').onclick=()=>{theme=themes[(themes.indexOf(theme)+1)%3];try{localStorage.setItem('doe2k-theme',theme);}catch(e){}applyTheme();};applyTheme();
let last=null, lastPrep=null;
window.GEnhance=function(state,run){
 if(lastPrep!==state.prep){last=null;lastPrep=state.prep;}
 const fit=state.fit, terms=state.terms, alpha=state.opts.alpha;
 const nf=x=>Number.isFinite(x)?x.toPrecision(6):'—';
 $('poolPanel').innerHTML=`<h2>Agrupación de efectos (pooling)</h2><p class="hint">Seleccione efectos despreciables para incorporarlos al error mediante reajuste. Se conserva la jerarquía fuerte, bloques y curvatura. p &gt; α no demuestra ausencia de efecto. En modelos saturados la decisión requiere conocimiento previo o exploración con Lenth; las pruebas posteriores a la selección son exploratorias.</p><div class="pool-options">${fit.coefs.filter(c=>c.kind==='term').map(c=>{
 const protectedTerm=terms.some(w=>w!==c.w&&(w&c.w)===c.w);
 const sig=Number.isFinite(c.p)&&c.p<=alpha;
 return `<label><input type="checkbox" value="${c.w}" ${protectedTerm||sig?'disabled':''}>${D.wname(c.w)} (p: ${nf(c.p)})${protectedTerm?' · jerarquía':sig?' · significativo':''}</label>`;
 }).join('')}</div><button id="poolApply">Agrupar seleccionados</button> <button id="poolUndo" ${last?'':'disabled'}>Restaurar modelo anterior</button><div id="poolReport" role="status"></div><details><summary>Pooling y foldover son procedimientos distintos</summary><p>El pooling modifica el modelo, sin añadir corridas. Foldover añade corridas a un diseño fraccionado para separar alias; requiere planear la fracción complementaria y no se aplica automáticamente por falta de significancia.</p></details>`;
 if(last && JSON.stringify(terms)===JSON.stringify(last.terms)) $('poolReport').textContent=`Agrupados: ${last.removed.map(D.wname).join(', ')}. Error anterior: SC=${nf(last.before.summary.sse)}, gl=${last.before.summary.dfE}, CM=${nf(last.before.summary.mse)}. Error agrupado: SC=${nf(fit.summary.sse)}, gl=${fit.summary.dfE}, CM=${nf(fit.summary.mse)}. Incremento conjunto: SC=${nf(last.ss)}, gl=${last.df}. Las SC ajustadas individuales no deben sumarse en diseños no ortogonales.`;
 $('poolApply').onclick=()=>{try{
 const removed=[...$('poolPanel').querySelectorAll('input:checked')].map(x=>+x.value);
 last=A.pool(state.prep,terms,removed,state.opts,state.est.estimable);state.terms=last.terms;run();
 }catch(e){$('poolReport').textContent=e.message;}};
 $('poolUndo').onclick=()=>{if(last){state.terms=last.before.terms.slice();last=null;run();}};
 const cs=fit.coefs.filter(c=>c.kind==='term');
 $('powerPanel').innerHTML=`<h2>Potencia estadística · planificación</h2><p class="hint">Prueba bilateral de un efecto estimable (F con 1 gl). Efecto Δ = cambio entre −1 y +1, en la escala analizada. En fracciones corresponde a la combinación de alias. Supone errores normales independientes, varianza constante y modelo fijado previamente.</p><div class="grid4"><label>Efecto<select id="pwTerm">${cs.map(c=>`<option value="${c.w}">${D.wname(c.w)}</option>`).join('')}</select></label><label>Δ mínimo de interés<input id="pwDelta" type="number" min="0" step="any" value="1"></label><label>σ esperado (desv. estándar)<input id="pwSigma" type="number" min="0" step="any" value="${fit.summary.s>0?fit.summary.s:1}"></label><label>Potencia objetivo<input id="pwTarget" type="number" min="0.01" max="0.99" step="0.01" value="0.8"></label></div><p class="hint">α = ${alpha}. σ inicial proviene del error del modelo cuando está disponible: valídelo con información independiente. No se calcula «potencia observada» a partir del efecto estimado.</p><button id="pwCalculate">Calcular potencia y réplicas</button><div id="powerResult" role="status"></div>`;
 $('pwCalculate').onclick=()=>{try{
 const c=cs.find(c=>c.w===+$('pwTerm').value),delta=+$('pwDelta').value,sigma=+$('pwSigma').value,target=+$('pwTarget').value;
 if(!c||!Number.isFinite(target)||!(target>0&&target<1))throw Error('Indique término y objetivo entre 0 y 1.');
 if(!['pwDelta','pwSigma','pwTarget'].every(id=>$(id).value.trim()))throw Error('Complete todos los campos.');
 const n=state.prep.n,p=fit.summary.p;
 const power=r=>S.effectPower(delta,sigma,c.vjj/r,r*n-p,alpha);
 const current=fit.summary.dfE>0?power(1):null;
 let needed=null;for(let r=1;r<=200;r++){if(r*n-p>0&&power(r)>=target){needed=r;break;}}
 const rows=[1,2,3,4,5,10].map(r=>`<tr><td>${r}</td><td>${n*r}</td><td>${r*n-p}</td><td>${r*n-p>0?(100*power(r)).toFixed(2)+' %':'Sin gl'}</td></tr>`).join('');
 $('powerResult').innerHTML=`<p>Potencia actual: <b>${current===null?'no definida (sin gl de error)':(100*current).toFixed(2)+' %'}</b>. ${needed===null?'Objetivo no alcanzado con hasta 200 repeticiones.':`Mínimo: ${needed} repetición(es) completas de la matriz actual (${needed*n} corridas totales).`}</p><div class="table-wrap"><table class="tbl"><tr><th>Repeticiones totales</th><th>N</th><th>gl error</th><th>Potencia</th></tr>${rows}</table></div><p class="hint">λ = (Δ/2)² / [σ²·vjj/r]; gl = rN − rango(X). Repite toda la matriz observada, incluidos centros y bloques con los mismos niveles; si cambia la estructura de bloques, recalcule con la matriz propuesta. Repetir una fracción no rompe sus alias.</p>`;
 }catch(e){$('powerResult').textContent=e.message;}};
};
})();
