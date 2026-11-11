(function (root) {
  'use strict';
  const clamp = (n, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, n));
  const mix = (a, b, t) => a + (b - a) * t;
  const clone = value => JSON.parse(JSON.stringify(value));
  const MAX_SLIDES = 100;
  const spaceKeys = ['x', 'y', 'width', 'height', 'rotation'];
  const motionBounds = { speed: [.2, 5], size: [10, 38], ripple: [0, 100], boost: [.2, 5], refinement: [0, 60], settle: [10, 45] };
  const spaceBounds = { x: [5, 95], y: [5, 95], width: [20, 100], height: [20, 100], rotation: [-180, 180] };
  const defaultSpace = { x: 50, y: 50, width: 65, height: 65, rotation: 0 };
  const defaultMotion = { speed: 1, size: 22, ripple: 42, boost: 1.8, refinement: 24, settle: 28 };
  const motionPresets = {
    calm: { label: 'Float', duration: 3.6, speed: .7, boost: 1.2, ripple: 30, refinement: 14, settle: 36 },
    flow: { label: 'Flow', duration: 2.8, speed: 1, boost: 1.8, ripple: 42, refinement: 24, settle: 28 },
    quick: { label: 'Quick', duration: 1.6, speed: 1.1, boost: 2.3, ripple: 35, refinement: 28, settle: 22 }
  };
  function applyMotionPreset(tr, key) {
    const preset = motionPresets[key];
    if (!preset) throw new Error('Choose a supported motion preset.');
    tr.duration = preset.duration; tr.easing = 'smooth';
    for (const name of ['speed', 'boost', 'ripple', 'refinement', 'settle']) tr.motion[name] = preset[name];
  }
  const smooth = t => { t = clamp(t); return t * t * (3 - 2 * t); };
  const smoother = t => { t = clamp(t); return t ** 3 * (10 + t * (-15 + 6 * t)); };
  const smootherIntegral = t => 2.5 * t ** 4 - 3 * t ** 5 + t ** 6;
  const newId = prefix => prefix + '-' + (root.crypto?.randomUUID?.() || Date.now().toString(36) + '-' + Math.random().toString(36).slice(2));
  const findSlide = (project, id) => project.slides.find(slide => slide.id === id);
  function createSlide(name = 'Untitled slide') {
    return { id: newId('slide'), name, space: clone(defaultSpace), content: { label: '', heading: '', body: '', source: '' } };
  }
  function createTransition(from, to) {
    return {
      id: newId('transition'), name: 'Cloud reshape', kind: 'cloud', from: from.id, to: to.id,
      duration: 2.8, easing: 'smooth',
      middle: Object.fromEntries(spaceKeys.map(key => [key, (from.space[key] + to.space[key]) / 2])),
      motion: clone(defaultMotion)
    };
  }
  // Preserve edits only when the exact same adjacent pair survives a sequence edit.
  function reconcileTransitions(project) {
    const old = new Map(project.transitions.map(tr => [tr.from + ':' + tr.to, tr]));
    project.transitions = project.slides.slice(0, -1).map((slide, i) => {
      const next = project.slides[i + 1];
      return old.get(slide.id + ':' + next.id) || createTransition(slide, next);
    });
  }
  function createProject() {
    const project = {
      version: 2, title: 'Cloud study',
      slides: [
        { ...createSlide('Opening'), id: 'opening', space: { x: 50, y: 48, width: 81, height: 51, rotation: 0 } },
        { ...createSlide('Make space'), id: 'space', space: { x: 32.5, y: 51, width: 57, height: 72, rotation: 0 } },
        { ...createSlide('A new perspective'), id: 'perspective', space: { x: 68.5, y: 48.5, width: 51, height: 67, rotation: 0 } }
      ], transitions: []
    };
    reconcileTransitions(project);
    return project;
  }
  function insertSlide(project, afterId, slide = createSlide()) {
    if (project.slides.length >= MAX_SLIDES) throw new Error('This presentation has reached its 100-slide limit.');
    if (findSlide(project, slide.id)) throw new Error('This slide already exists.');
    const index = project.slides.findIndex(item => item.id === afterId);
    project.slides.splice(index < 0 ? project.slides.length : index + 1, 0, slide);
    reconcileTransitions(project);
    return slide.id;
  }
  function duplicateSlide(project, id) {
    const original = findSlide(project, id);
    if (!original) throw new Error('Select a slide to duplicate.');
    const copy = clone(original);
    copy.id = newId('slide'); copy.name = original.name.slice(0, 73) + ' copy';
    return insertSlide(project, id, copy);
  }
  function deleteSlide(project, id) {
    const index = project.slides.findIndex(slide => slide.id === id);
    if (index < 0) return null;
    project.slides.splice(index, 1);
    reconcileTransitions(project);
    return project.slides[Math.min(index, project.slides.length - 1)]?.id || null;
  }
  function moveSlide(project, id, delta) {
    const index = project.slides.findIndex(slide => slide.id === id);
    if (index < 0) return false;
    const destination = clamp(index + delta, 0, project.slides.length - 1);
    if (destination === index) return false;
    const [slide] = project.slides.splice(index, 1);
    project.slides.splice(destination, 0, slide);
    reconcileTransitions(project);
    return true;
  }
  function getSpace(project, index, key) {
    const tr = project.transitions[index];
    if (!tr) return project.slides[0]?.space || defaultSpace;
    return key === 'middle' ? tr.middle : findSlide(project, key === 'start' ? tr.from : tr.to).space;
  }
  // A shared midpoint tangent keeps both segments moving as one path.
  // A direction reversal deliberately has a zero tangent to avoid overshoot.
  function interpolateTrack(a, b, c, t, easing) {
    const before = 2 * (b - a), after = 2 * (c - b);
    let middle = 0;
    if (before * after > 0) {
      const harmonic = 2 * before * after / (before + after);
      middle = Math.sign(harmonic) * Math.min(1.5 * Math.abs(harmonic), 3 * Math.min(Math.abs(before), Math.abs(after)));
    }
    const first = t <= .5, u = first ? t * 2 : (t - .5) * 2;
    const start = first ? a : b, end = first ? b : c;
    if (easing === 'linear') return mix(start, end, u);
    const tangentStart = first ? (easing === 'easeOut' ? before * 1.6 : 0) : middle;
    const tangentEnd = first ? middle : 0;
    return (2*u**3-3*u**2+1)*start + (u**3-2*u**2+u)*tangentStart*.5
      + (-2*u**3+3*u**2)*end + (u**3-u**2)*tangentEnd*.5;
  }
  function sampleSpace(project, index, progress) {
    const tr = project.transitions[index], t = clamp(progress);
    if (!tr) return clone(project.slides[0]?.space || defaultSpace);
    const a = getSpace(project, index, 'start'), b = tr.middle, c = getSpace(project, index, 'end');
    return Object.fromEntries(spaceKeys.map(key => [key, interpolateTrack(a[key], b[key], c[key], t, tr.easing)]));
  }
  function motionPhases(motion) {
    const settle = (motion.settle ?? defaultMotion.settle) / 100;
    return { start: .035, peak: .5 - settle * .25, end: 1 - settle * .4 };
  }
  function motionEnvelope(motion, progress) {
    const t = clamp(progress), { start, peak, end } = motionPhases(motion);
    return t <= peak ? smoother((t - start) / (peak - start)) : 1 - smoother((t - peak) / (end - peak));
  }
  function envelopeIntegral(motion, progress) {
    const t = clamp(progress), { start, peak, end } = motionPhases(motion);
    if (t <= start) return 0;
    if (t <= peak) return (peak - start) * smootherIntegral((t - start) / (peak - start));
    if (t >= end) return (end - start) / 2;
    const u = (t - peak) / (end - peak);
    return (peak - start) / 2 + (end - peak) * (u - smootherIntegral(u));
  }
  // Adjacent transitions meet at the same resting speed and texture size.
  function slideRestStyle(project, slideIndex) {
    const incoming = project.transitions[slideIndex - 1]?.motion;
    const outgoing = project.transitions[slideIndex]?.motion;
    const a = incoming || outgoing || defaultMotion, b = outgoing || incoming || defaultMotion;
    return { speed: (a.speed + b.speed) / 2, size: (a.size + b.size) / 2 };
  }
  function sampleMotion(project, index, progress) {
    const tr = project.transitions[index], motion = tr?.motion || defaultMotion, t = clamp(progress);
    const a = slideRestStyle(project, index), b = slideRestStyle(project, index + 1);
    const envelope = tr ? motionEnvelope(motion, t) : 0;
    const boost = Math.max(0, motion.boost - Math.max(a.speed, b.speed));
    return {
      envelope,
      speed: mix(a.speed, b.speed, smooth(t)) + boost * envelope,
      size: mix(a.size, b.size, smooth(t)) * (1 - motion.refinement / 100 * envelope),
      ripple: motion.ripple / 100 * envelope
    };
  }
  function driftIntegral(tr, progress, startSpeed = tr.motion.speed, endSpeed = tr.motion.speed) {
    const t = clamp(progress), boost = Math.max(0, tr.motion.boost - Math.max(startSpeed, endSpeed));
    return tr.duration * (startSpeed * t + (endSpeed - startSpeed) * (t**3 - .5*t**4) + boost * envelopeIntegral(tr.motion, t));
  }
  function sampleTime(project, index, t) {
    let time = 18;
    for (let i = 0; i <= index && i < project.transitions.length; i++) {
      time += driftIntegral(project.transitions[i], i === index ? t : 1, slideRestStyle(project, i).speed, slideRestStyle(project, i + 1).speed);
    }
    return time;
  }
  function contentOpacity(tr, progress) {
    const t = clamp(progress);
    const entrance = 1 - (tr?.motion.settle ?? defaultMotion.settle) / 100;
    return t < .5 ? 1 - smoother(t / .22) : smoother((t - entrance) / (1 - entrance));
  }
  function safeBox(space, width, height) {
    const a = space.width / 100 * width * .72, b = space.height / 100 * height * .68;
    const angle = space.rotation * Math.PI / 180, c = Math.abs(Math.cos(angle)), s = Math.abs(Math.sin(angle));
    const scale = Math.min(1, a / (c * a + s * b), b / (s * a + c * b));
    const x = space.x / 100 * width, y = space.y / 100 * height;
    return { x, y, width: Math.min(a * scale, 2 * Math.min(x, width - x)), height: Math.min(b * scale, 2 * Math.min(y, height - y)) };
  }
  function validateProject(input) {
    if (!input || ![1, 2].includes(input.version) || !Array.isArray(input.slides) || input.slides.length > MAX_SLIDES || !Array.isArray(input.transitions)) throw new Error('Choose a Pixel Clouds presentation export (version 1 or 2, up to 100 slides).');
    const legacy = input.version === 1;
    if (legacy && input.slides.length !== 3) throw new Error('The older project must contain its original three slides.');
    if (input.transitions.length !== Math.max(0, input.slides.length - 1)) throw new Error('Each neighboring pair of slides must have one transition.');
    const number = (value, bounds) => {
      if (typeof value !== 'number' || !Number.isFinite(value) || value < bounds[0] || value > bounds[1]) throw new Error('The project contains an invalid or out-of-range setting.');
      return value;
    };
    const text = (value, limit, blank = true) => {
      if (typeof value !== 'string' || value.length > limit || (!blank && !value.trim())) throw new Error('The project contains an invalid title or text block.');
      return value;
    };
    const id = value => {
      if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(value)) throw new Error('The project contains an invalid slide or transition ID.');
      return value;
    };
    const readSpace = value => {
      if (!value || typeof value !== 'object') throw new Error('The project is missing whitespace keyframes.');
      return Object.fromEntries(spaceKeys.map(key => [key, number(value[key], spaceBounds[key])]));
    };
    const slides = input.slides.map((slide, i) => {
      if (!slide) throw new Error('The project contains an invalid slide.');
      return {
        id: id(slide.id), name: text(slide.name || (legacy ? 'Slide ' + (i + 1) : ''), 80, false),
        space: readSpace(slide.space),
        content: legacy ? { label: '', heading: '', body: '', source: '' } : {
          label: text(slide.content?.label ?? '', 100), heading: text(slide.content?.heading, 160),
          body: text(slide.content?.body, 2000), source: text(slide.content?.source ?? '', 500)
        }
      };
    });
    if (new Set(slides.map(slide => slide.id)).size !== slides.length) throw new Error('Each slide must have a unique ID.');
    const transitions = input.transitions.map((source, i) => {
      if (!source || (legacy ? source.from !== i || source.to !== i + 1 : source.from !== slides[i].id || source.to !== slides[i + 1].id)) throw new Error('The transitions do not match the slide order.');
      if (!['smooth', 'linear', 'easeOut'].includes(source.easing)) throw new Error('The movement curve is not supported.');
      if (!legacy && source.kind !== 'cloud') throw new Error('Only cloud transitions are supported.');
      if (!source.motion) throw new Error('The project is missing motion settings.');
      const motion = Object.fromEntries(Object.entries(motionBounds).map(([key, bounds]) => [key, number(key === 'settle' && source.motion[key] === undefined ? defaultMotion.settle : source.motion[key], bounds)]));
      const stockMotion = source.motion.settle === undefined && motion.speed === 1 && motion.size === 22 && motion.ripple === 60 && motion.boost === 1 && motion.refinement === 0;
      if (stockMotion) Object.assign(motion, defaultMotion);
      motion.boost = Math.max(motion.speed, motion.boost);
      // The former heat-map transition becomes a calm blue-cloud reshape.
      // Keep all authored geometry, duration, easing, pixel size, and base drift.
      if (legacy && i === 1) { motion.boost = Math.max(motion.speed, defaultMotion.boost); motion.refinement = defaultMotion.refinement; }
      return { id: id(source.id), name: 'Cloud reshape', kind: 'cloud', from: slides[i].id, to: slides[i + 1].id, duration: number(source.duration, [.8, 8]), easing: source.easing, middle: readSpace(source.middle), motion };
    });
    if (new Set(transitions.map(tr => tr.id)).size !== transitions.length) throw new Error('Each transition must have a unique ID.');
    return { version: 2, title: legacy ? 'Cloud study' : text(input.title, 120, false), slides, transitions };
  }
  const api = { motionPresets, applyMotionPreset, motionPhases, motionEnvelope, sampleMotion, slideRestStyle, contentOpacity, MAX_SLIDES, createProject, createSlide, createTransition, reconcileTransitions, insertSlide, duplicateSlide, deleteSlide, moveSlide, findSlide, defaultSpace, defaultMotion, clone, clamp, mix, spaceKeys, motionBounds, getSpace, sampleSpace, sampleTime, driftIntegral, safeBox, validateProject };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PixelCloudModel = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
