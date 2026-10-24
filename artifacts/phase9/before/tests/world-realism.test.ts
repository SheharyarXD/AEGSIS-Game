import {strict as assert} from 'node:assert';
import {test} from 'node:test';
import {Vector3} from 'three';
import {ArchitectureImpactEffects} from '../src/world/environment/ArchitectureImpactEffects';

test('impact effects stay bounded under missile spam and changing quality, then fully expire',()=>{
 const fx=new ArchitectureImpactEffects(),p=new Vector3(0,14,0),n=new Vector3(0,0,1);
 for(const quality of ['ULTRA','LOW','HIGH','MEDIUM']){fx.setQuality(quality);for(let i=0;i<180;i++){fx.impact(new Vector3(i%20,14,0),n,70,i,true);fx.update(.016,p);}const d=fx.diagnostics();assert.ok(d.particles<=d.particleCap);assert.ok(d.fires<=12);assert.ok(d.scars<=96);assert.equal(fx.group.children.length,4);}
 for(let i=0;i<220;i++)fx.update(.15,p);assert.equal(fx.diagnostics().particles,0);assert.equal(fx.diagnostics().fires,0);assert.ok(fx.diagnostics().scars>0);fx.reset();assert.equal(fx.diagnostics().scars,0);fx.dispose();
});
test('removed surfaces invalidate attached scars/fire without removing airborne smoke',()=>{
 const fx=new ArchitectureImpactEffects(),p=new Vector3(0,10,0),n=new Vector3(0,0,1);let present=true;
 fx.setSurfaceResolver((_id,point,normal)=>present?{p:point.clone(),n:normal.clone()}:null);
 fx.impact(p,n,80,235,true);fx.update(.25,p);assert.equal(fx.diagnostics().fires,1);assert.equal(fx.diagnostics().scars,1);
 present=false;fx.invalidate(235);fx.update(.25,p);assert.equal(fx.group.children[1].count,0);fx.update(.25,p);fx.update(.25,p);assert.equal(fx.diagnostics().fires,0);assert.equal(fx.diagnostics().scars,0);assert.ok(fx.diagnostics().particles>0);fx.dispose();
});
test('surviving rim anchors replace the destroyed impact surface and reset releases the pool',()=>{
 const fx=new ArchitectureImpactEffects(),p=new Vector3(0,10,0),n=new Vector3(0,0,1),rim=new Vector3(1,9,0);
 fx.setSurfaceResolver(()=>({p:rim.clone(),n:n.clone()}));fx.impact(p,n,80,235,true);fx.update(.25,p);assert.ok(fx.scars[0].p.distanceTo(rim)<.05);
 fx.structural(rim,20,235);fx.setWeather(14,.9);fx.update(.15,p);assert.equal(fx.diagnostics().wind,14);assert.ok(fx.diagnostics().particles<=64);fx.reset();for(const o of fx.group.children)if('count' in o)assert.equal(o.count,0);fx.dispose();
});
