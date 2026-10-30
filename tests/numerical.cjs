const assert=require('node:assert/strict');
require('../js/stats.js');require('../js/design.js');require('../js/analysis.js');
const S=Stats,A=Analysis;let checks=0;
function near(a,b,t=1e-8){assert.ok(Math.abs(a-b)<t,`${a} ≠ ${b}`);checks++;}
near(S.fcritical(.05,1,10),4.9646027437,1e-8);
near(S.tinv(.975,10),2.22813885196,1e-8);
near(S.ncfSF(4,1,10,0),S.fsf(4,1,10));
// Referencia independiente: integral de la representación t no central,
// cuadratura Simpson y CDF normal por aproximación erf (error < 8e-8).
function Phi(x){const z=Math.abs(x)/Math.SQRT2,t=1/(1+.3275911*z);const erf=1-(((((1.061405429*t-1.453152027)*t+1.421413741)*t-.284496736)*t+.254829592)*t)*Math.exp(-z*z);return (1+Math.sign(x)*erf)/2;}
function reference(f,df,lambda){const delta=Math.sqrt(lambda),upper=Math.sqrt(df)+15,N=30000,h=upper/N;
 const fn=t=>{if(t===0)return 0;const density=2*Math.exp((df-1)*Math.log(t)-t*t/2-(df/2)*Math.log(2)-S.lgamma(df/2));const a=Math.sqrt(f/df)*t;return density*(Phi(delta-a)+Phi(-delta-a));};
 let sum=fn(0)+fn(upper);for(let i=1;i<N;i++)sum+=(i%2?4:2)*fn(i*h);return sum*h/3;}
for(const df of [2,8,30])for(const lambda of [0,1,10,100,1500])near(S.ncfSF(5,1,df,lambda),reference(5,df,lambda),3e-7);
for(const df of [4,10,30])near(S.effectPower(0,1,.125,df,.05),.05);
assert.throws(()=>S.effectPower(1,0,.1,4,.05));checks++;
const X=[],y=[];for(let r=0;r<2;r++)for(let i=0;i<8;i++){const x=[0,1,2].map(j=>i>>j&1?1:-1);X.push(x);y.push(10+2*x[0]+3*x[0]*x[1]+.1*x[0]*x[1]*x[2]+(r?1:-1)*.5);}
const prep=A.prepare({X,y}),opts={alpha:.05,blocks:false,curv:false},terms=[1,2,4,3,5,6,7];
const full=A.fit(prep,terms,opts);near(full.summary.sse,4);assert.equal(full.summary.dfE,8);checks++;
near(full.coefs.find(c=>c.w===1).effect,4);
assert.throws(()=>A.pool(prep,terms,[1],opts,terms));checks++;
const pooled=A.pool(prep,terms,[7],opts,terms);near(pooled.ss,.16);assert.equal(pooled.df,1);checks++;near(pooled.after.summary.sse,4.16);
const unbalanced=A.prepare({X:X.slice(1),y:y.slice(1)}),ub=A.pool(unbalanced,terms,[7,5,6],opts,terms);near(ub.after.summary.sse,ub.before.summary.sse+ub.ss);assert.ok(ub.df===3);checks++;
const saturated=A.prepare({X:X.slice(0,8),y:y.slice(0,8)});assert.equal(A.pool(saturated,terms,[7],opts,terms).after.summary.dfE,1);checks++;
near(S.effectPower(2,1,.125,8,.05),S.ncfSF(S.fcritical(.05,1,8),1,8,8));
console.log(`${checks} comprobaciones correctas; referencia F no central: error absoluto < 3e-7.`);
