const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const M = require('../dist/model.js');
const legacy = require('./fixtures/legacy-project.json');

function assertValidSequence(project) {
  assert.equal(project.transitions.length, Math.max(0, project.slides.length - 1));
  project.transitions.forEach((tr, i) => {
    assert.equal(tr.from, project.slides[i].id);
    assert.equal(tr.to, project.slides[i + 1].id);
    assert.equal(tr.kind, 'cloud');
  });
  assert.deepEqual(M.validateProject(M.clone(project)), project);
}

test('new presentations have three blue-cloud slides and stable slide references', () => {
  const project = M.createProject();
  assert.equal(project.version, 2); assert.equal(project.slides.length, 3);
  assertValidSequence(project);
  assert.ok(project.transitions.every(tr => tr.motion.boost > tr.motion.speed && tr.motion.boost <= 5 && tr.motion.refinement > 0));
});

test('legacy migration preserves authored layouts and replaces the old heat transition', () => {
  const input = M.clone(legacy);
  input.slides[0].space.width = 90;
  input.transitions[1].middle.rotation = 35;
  input.transitions[0].duration = 4;
  const project = M.validateProject(input);
  assert.equal(project.slides[0].space.width, 90);
  assert.equal(project.transitions[1].middle.rotation, 35);
  assert.equal(project.transitions[0].duration, 4);
  assert.ok(project.transitions[1].motion.boost < input.transitions[1].motion.boost);
  assert.equal(project.transitions[1].motion.refinement, M.defaultMotion.refinement);
  assert.equal(project.transitions[1].motion.whiteHold, undefined);
  assert.ok(project.slides.every(slide => slide.content.heading === ''));
  assertValidSequence(project);
});

test('inserting at the beginning, middle, and end reconciles transitions', () => {
  const project = M.createProject(), preserved = M.clone(project.transitions[1]);
  const newId = M.insertSlide(project, project.slides[0].id);
  assert.equal(project.slides[1].id, newId);
  assert.deepEqual(project.transitions[2], preserved);
  M.insertSlide(project, project.slides.at(-1).id);
  assertValidSequence(project);
  M.moveSlide(project, newId, -1);
  assert.equal(project.slides[0].id, newId);
  assertValidSequence(project);
});

test('duplicated slides have independent text, layout, and IDs', () => {
  const project = M.createProject(), original = project.slides[0];
  original.content.heading = 'A clearer perspective'; original.content.body = 'One idea.';
  original.space.rotation = 25;
  const copyId = M.duplicateSlide(project, original.id), copy = M.findSlide(project, copyId);
  assert.equal(copy.content.heading, original.content.heading);
  assert.equal(copy.space.rotation, 25); assert.notEqual(copy.id, original.id);
  copy.content.heading = 'A second idea'; copy.space.rotation = 70;
  assert.equal(original.content.heading, 'A clearer perspective'); assert.equal(original.space.rotation, 25);
  assertValidSequence(project);
});

test('deleting a middle slide builds a bridge and keeps unrelated transitions', () => {
  const project = M.createProject();
  const last = M.insertSlide(project, project.slides.at(-1).id);
  const saved = M.clone(project.transitions[2]);
  const removed = project.slides[1].id;
  const neighbor = M.deleteSlide(project, removed);
  assert.equal(neighbor, project.slides[1].id);
  assert.equal(project.slides.at(-1).id, last);
  assert.deepEqual(project.transitions[1], saved);
  assert.ok(project.transitions.every(tr => tr.from !== removed && tr.to !== removed));
  assertValidSequence(project);
});

test('moving slides retains their content and matching transition settings', () => {
  const project = M.createProject();
  M.insertSlide(project, project.slides.at(-1).id);
  const [a, b, c, d] = project.slides;
  a.content.body = 'Keep this attached to the slide';
  project.transitions[2].duration = 6; project.transitions[2].middle.rotation = 37;
  const retained = M.clone(project.transitions[2]);
  M.moveSlide(project, b.id, -1);
  assert.deepEqual(project.slides.map(s => s.id), [b.id, a.id, c.id, d.id]);
  assert.equal(M.findSlide(project, a.id).content.body, 'Keep this attached to the slide');
  assert.deepEqual(project.transitions[2], retained);
  assert.equal(M.moveSlide(project, b.id, -1), false);
  assert.equal(M.moveSlide(project, d.id, 1), false);
  assertValidSequence(project);
});

test('one-slide and empty presentations can be saved, imported, and rebuilt', () => {
  const project = M.createProject();
  while (project.slides.length > 1) M.deleteSlide(project, project.slides[0].id);
  assertValidSequence(project);
  assert.deepEqual(M.sampleSpace(project, 0, .5), project.slides[0].space);
  assert.equal(M.sampleTime(project, 0, 1), 18);
  assert.equal(M.deleteSlide(project, project.slides[0].id), null);
  assertValidSequence(project);
  const added = M.insertSlide(project, null);
  assert.equal(project.slides[0].id, added);
  assertValidSequence(project);
});

test('each geometry keyframe is hit exactly for every movement curve', () => {
  const project = M.createProject();
  for (let i = 0; i < project.transitions.length; i++) {
    for (const easing of ['smooth', 'linear', 'easeOut']) {
      project.transitions[i].easing = easing; project.transitions[i].middle.rotation = 65;
      for (const [key, t] of [['start', 0], ['middle', .5], ['end', 1]]) assert.deepEqual(M.sampleSpace(project, i, t), M.getSpace(project, i, key));
    }
  }
});

test('neighboring transitions share whitespace and deterministic drift time', () => {
  const project = M.createProject();
  M.getSpace(project, 0, 'end').rotation = 34; M.getSpace(project, 0, 'end').x = 43;
  assert.deepEqual(M.sampleSpace(project, 0, 1), M.sampleSpace(project, 1, 0));
  assert.equal(M.sampleTime(project, 0, 1), M.sampleTime(project, 1, 0));
});

test('upright content safe areas stay inside rotated whitespace and slide bounds', () => {
  for (const rotation of [-180, -135, -90, -45, 0, 25, 45, 90, 135, 180]) {
    for (const position of [5, 50, 95]) {
      const space = { x: position, y: position, width: 57, height: 72, rotation }, safe = M.safeBox(space, 800, 500);
      const radians = rotation * Math.PI / 180;
      for (const dx of [-safe.width / 2, safe.width / 2]) for (const dy of [-safe.height / 2, safe.height / 2]) {
        const x = dx * Math.cos(radians) + dy * Math.sin(radians), y = -dx * Math.sin(radians) + dy * Math.cos(radians);
        assert.ok(Math.abs(x) <= .72 * space.width / 200 * 800 + 1e-9);
        assert.ok(Math.abs(y) <= .68 * space.height / 200 * 500 + 1e-9);
        assert.ok(safe.x + dx >= -1e-9 && safe.x + dx <= 800 + 1e-9);
        assert.ok(safe.y + dy >= -1e-9 && safe.y + dy <= 500 + 1e-9);
      }
    }
  }
});

test('imports round-trip authored content and reject broken references or invalid data', () => {
  const project = M.createProject();
  project.title = 'My presentation'; project.slides[1].name = 'A renamed slide';
  project.slides[1].content.heading = '<b>Plain text, not markup</b>';
  project.slides[1].content.body = 'Line one\nLine two';
  assertValidSequence(project);
  for (const mutate of [
    p => { p.version = 9; }, p => { p.slides.pop(); }, p => { p.slides[0].space.width = 0; },
    p => { p.transitions[0].motion.speed = 6; }, p => { p.transitions[0].duration = NaN; },
    p => { p.transitions[0].motion = null; }, p => { p.transitions[0].easing = 'unknown'; },
    p => { p.transitions[0].from = p.slides[2].id; }, p => { p.slides[0] = null; },
    p => { p.slides[1].id = p.slides[0].id; }, p => { p.transitions[0].kind = 'heat'; },
    p => { p.slides[0].content.body = 'x'.repeat(2001); }, p => { p.title = ''; },
    p => { p.transitions[0].motion.settle = 0; }, p => { p.transitions[0].motion.settle = 50; }
  ]) { const bad = M.clone(project); mutate(bad); assert.throws(() => M.validateProject(bad)); }
});

test('all frames use only the blue cloud palette, with no midpoint clearing', () => {
  let calls = [], patternColors = [];
  const ctx = { fillStyle: '', fillRect(...args) { calls.push([this.fillStyle, ...args]); }, createPattern: () => 'checker' };
  const canvas = { getContext: () => ctx, getBoundingClientRect: () => ({ width: 800, height: 500 }) };
  const sandbox = { PixelCloudModel: M, devicePixelRatio: 1, document: { createElement: () => ({ getContext: () => ({ fillStyle: '', fillRect() { patternColors.push(this.fillStyle); } }) }) } };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(require.resolve('../dist/renderer.js'), 'utf8'), sandbox);
  const renderer = new sandbox.PixelCloudRenderer(canvas); renderer.resize();
  const project = M.createProject();
  const draw = (index, t) => { calls = []; renderer.draw(project, index, t); return JSON.stringify(calls); };
  const first = draw(0, .27); draw(0, .81); assert.equal(draw(0, .27), first);
  assert.equal(draw(0, 1), draw(1, 0));
  const allowed = new Set(['#ffffff', '#08a9ef', '#7bcaff', 'checker']);
  for (const index of [0, 1]) for (const t of [0, .2, .48, .5, .52, .8, 1]) {
    draw(index, t);
    assert.ok(calls.length > 1, 'clouds remain visible at every sampled frame');
    assert.ok(calls.every(([color]) => allowed.has(color)));
  }
  assert.ok(patternColors.every(color => allowed.has(color)));
  const before = draw(0, .5); project.transitions[0].middle.rotation = 45; assert.notEqual(draw(0, .5), before);
  while (project.slides.length > 1) M.deleteSlide(project, project.slides[0].id);
  assert.doesNotThrow(() => draw(0, 0));
});

test('glide passes through the midpoint without a pause or a velocity jump', () => {
  const project = M.createProject(), h = 1e-5;
  for (const easing of ['smooth', 'easeOut']) {
    project.transitions[0].easing = easing;
    const x = t => M.sampleSpace(project, 0, t).x;
    const before = (x(.5) - x(.5 - h)) / h, after = (x(.5 + h) - x(.5)) / h;
    assert.ok(Math.abs(before) > 1);
    assert.ok(Math.abs(before - after) < .01);
    assert.ok(Math.abs((x(1) - x(1 - h)) / h) < .01);
  }
  project.transitions[0].easing = 'smooth';
  const x = t => M.sampleSpace(project, 0, t).x;
  assert.ok(Math.abs((x(h) - x(0)) / h) < .01);
});

test('custom keyframe paths remain bounded even for extreme reversals and flat segments', () => {
  const project = M.createProject(), tr = project.transitions[0];
  for (const easing of ['smooth', 'easeOut']) for (const a of [5, 50, 95]) for (const b of [5, 50, 95]) for (const c of [5, 50, 95]) {
    tr.easing = easing; M.getSpace(project, 0, 'start').x = a; tr.middle.x = b; M.getSpace(project, 0, 'end').x = c;
    for (let i = 0; i <= 200; i++) {
      const t = i / 200, x = M.sampleSpace(project, 0, t).x;
      const lo = Math.min(t <= .5 ? a : b, t <= .5 ? b : c), hi = Math.max(t <= .5 ? a : b, t <= .5 ? b : c);
      assert.ok(x >= lo - 1e-8 && x <= hi + 1e-8, easing + ': ' + [a, b, c, t, x].join(','));
    }
  }
});

test('drift integration matches speed and remains continuous across mismatched transitions', () => {
  const project = M.createProject();
  Object.assign(project.transitions[0].motion, { speed: .3, boost: 4.9, size: 10, settle: 45 });
  Object.assign(project.transitions[1].motion, { speed: 4.7, boost: 5, size: 38, settle: 10 });
  const a = M.sampleMotion(project, 0, 1), b = M.sampleMotion(project, 1, 0);
  assert.equal(a.speed, b.speed); assert.equal(a.size, b.size);
  const h = 1e-5;
  for (let index = 0; index < 2; index++) for (let i = 1; i < 100; i++) {
    const t = i / 100, expected = M.sampleMotion(project, index, t).speed;
    const actual = (M.sampleTime(project, index, t + h) - M.sampleTime(project, index, t - h)) / (2 * h * project.transitions[index].duration);
    assert.ok(Math.abs(expected - actual) < 1e-6);
    assert.ok(expected >= .2 && expected <= 5);
  }
  assert.equal(M.sampleTime(project, 0, 1), M.sampleTime(project, 1, 0));
});

test('texture and ripple settle before arrival with no abrupt onset', () => {
  const motion = { ...M.defaultMotion };
  for (const settle of [10, 28, 45]) {
    motion.settle = settle;
    const { start, peak, end } = M.motionPhases(motion);
    assert.equal(M.motionEnvelope(motion, 0), 0);
    assert.equal(M.motionEnvelope(motion, start), 0);
    assert.equal(M.motionEnvelope(motion, peak), 1);
    assert.equal(M.motionEnvelope(motion, end), 0);
    assert.equal(M.motionEnvelope(motion, 1), 0);
    assert.ok(end < 1);
    const h = 1e-5;
    assert.ok(M.motionEnvelope(motion, start + h) / h < .001);
    assert.ok(M.motionEnvelope(motion, end - h) / h < .001);
  }
});

test('motion presets change timing and texture while preserving content and geometry', () => {
  const project = M.createProject();
  project.slides[0].content.heading = 'Keep this idea';
  project.transitions[0].middle.rotation = 37;
  const geometry = M.clone(project.transitions[0].middle), slides = M.clone(project.slides);
  for (const key of Object.keys(M.motionPresets)) {
    M.applyMotionPreset(project.transitions[0], key);
    assert.deepEqual(project.slides, slides);
    assert.deepEqual(project.transitions[0].middle, geometry);
    assert.ok(project.transitions[0].motion.boost <= 5);
    assertValidSequence(project);
  }
  assert.throws(() => M.applyMotionPreset(project.transitions[0], 'unknown'));
});

test('older presentation saves gain settling without overwriting custom timings or texture settings', () => {
  const old = M.clone(require('./fixtures/presentation-v2.json'));
  old.transitions[0].duration = 5.3;
  Object.assign(old.transitions[0].motion, { speed: 2, size: 30, ripple: 81, boost: 3.1, refinement: 16 });
  const upgraded = M.validateProject(old);
  assert.equal(upgraded.transitions[0].duration, 5.3);
  for (const key of ['speed', 'size', 'ripple', 'boost', 'refinement']) assert.equal(upgraded.transitions[0].motion[key], old.transitions[0].motion[key]);
  assert.equal(upgraded.transitions[0].motion.settle, M.defaultMotion.settle);
  assert.equal(upgraded.transitions[1].duration, old.transitions[1].duration);
  assert.equal(upgraded.transitions[1].motion.boost, M.defaultMotion.boost);
  assert.deepEqual(upgraded.slides, old.slides.map(slide => ({ ...slide, content: { label: '', source: '', ...slide.content } })));
  assertValidSequence(upgraded);
});

test('section labels and source credits survive edits and export without affecting older copy', () => {
  const project = M.validateProject(require('./fixtures/presentation-v2.json'));
  project.slides[0].content.label = 'THE PROOF';
  project.slides[0].content.source = 'Peng et al. (2023), The Impact of AI on Developer Productivity';
  const copy = M.findSlide(project, M.duplicateSlide(project, project.slides[0].id));
  assert.deepEqual(copy.content, project.slides[0].content);
  assertValidSequence(project);
  for (const [key, value] of [['label', 42], ['source', 'x'.repeat(501)]]) {
    const bad = M.clone(project); bad.slides[0].content[key] = value;
    assert.throws(() => M.validateProject(bad));
  }
});

test('texture refinement keeps anchored cell boundaries and matches at shared slide endpoints', () => {
  let calls = [];
  const ctx = { fillStyle: '', fillRect(...args) { calls.push([this.fillStyle, ...args]); }, createPattern: () => 'checker' };
  const canvas = { getContext: () => ctx, getBoundingClientRect: () => ({ width: 800, height: 500 }) };
  const sandbox = { PixelCloudModel: M, devicePixelRatio: 1, document: { createElement: () => ({ getContext: () => ({ fillRect() {} }) }) } };
  vm.createContext(sandbox); vm.runInContext(fs.readFileSync(require.resolve('../dist/renderer.js'), 'utf8'), sandbox);
  const renderer = new sandbox.PixelCloudRenderer(canvas); renderer.resize();
  const project = M.createProject();
  Object.assign(project.transitions[0].motion, { size: 10, refinement: 60, speed: .4 });
  Object.assign(project.transitions[1].motion, { size: 38, refinement: 35, speed: 3 });
  const draw = (index, t) => { calls = []; renderer.draw(project, index, t); return JSON.stringify(calls); };
  assert.equal(draw(0, 1), draw(1, 0));
  const unit = Math.max(8, 40 * Math.min(800 / 1708, 500 / 1024)) / 8;
  const xAnchors = new Set(Array.from({length: Math.ceil(800 / unit) + 10}, (_, i) => Math.round(i * unit)));
  const yAnchors = new Set(Array.from({length: Math.ceil(500 / unit) + 10}, (_, i) => Math.round(i * unit)));
  for (const t of [0, .1, .3, .43, .6, .8, 1]) {
    draw(0, t);
    for (const [, x, y] of calls) { assert.ok(xAnchors.has(x)); assert.ok(yAnchors.has(y)); }
  }
});

test('content fades are smooth and follow the selected arrival window', () => {
  const tr = M.createProject().transitions[0];
  for (const settle of [10, 28, 45]) {
    tr.motion.settle = settle;
    assert.equal(M.contentOpacity(tr, 0), 1);
    assert.equal(M.contentOpacity(tr, .5), 0);
    assert.equal(M.contentOpacity(tr, 1), 1);
    assert.equal(M.contentOpacity(tr, 1 - settle / 100), 0);
  }
});
