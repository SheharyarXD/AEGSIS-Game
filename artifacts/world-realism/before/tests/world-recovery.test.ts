import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Vector3} from 'three';
import {WorldRecovery} from '../src/world/WorldRecovery';

test('world recovery permits skyline ascent and returns an escaped flyer to the last landing',()=>{
  const recovery=new WorldRecovery(),roof=new Vector3(328,280,-496);
  assert.equal(recovery.check(roof,true),null);
  assert.equal(recovery.check(new Vector3(328,15000,-496),false),null);
  assert.deepEqual(recovery.check(new Vector3(1201,500,-496),false)?.toArray(),[328,280.25,-496]);
});
test('falling into water recovers to dry ground and never records the sea floor as an anchor',()=>{
  const recovery=new WorldRecovery(),street=new Vector3(832,.03,480);
  recovery.check(street,true);recovery.check(new Vector3(950,-2,200),true);
  assert.deepEqual(recovery.check(new Vector3(950,-6,200),false)?.toArray(),[832,.28,480]);
  recovery.reset();assert.deepEqual(recovery.check(new Vector3(NaN,0,0),false)?.toArray(),[0,.47,58]);
});
