(() => {
  'use strict';
  const M = PixelCloudModel, $ = id => document.getElementById(id);
  const all = selector => [...document.querySelectorAll(selector)];
  const storageKey = 'pixel-clouds-presentation-v2', legacyKey = 'pixel-clouds-transition-studio-v1';
  const renderer = new PixelCloudRenderer($('clouds'));
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let project = PixelCloudStarter.createProject(), selected = 0, selectedSlideId = project.slides[0].id;
  let mode = 'slide', keyframe = 'start', progress = 0;
  let playing = false, loop = false, rate = 1, frame = null, last = 0, loopHold = 0, direction = 1;
  let guides = true, showSafe = true, sample = false, sampleType = 'title';
  let presenting = false, presentSlide = 0, presentationTime = 18, editorView = null;
  let pendingEdit = null, undoStack = [], redoStack = [], saveTimer, toastTimer;
  let loadMessage = '', migrated = false;
  try {
    const saved = localStorage.getItem(storageKey) || localStorage.getItem(legacyKey);
    if (saved) {
      const input = JSON.parse(saved);
      project = M.validateProject(input);
      migrated = input.version === 1;
      if (migrated) loadMessage = 'Your slide layouts are preserved. All transitions now stay in blue clouds.';
    }
  } catch {
    loadMessage = 'Saved settings could not be loaded. Defaults are open; your saved data has not been overwritten.';
    $('saveStatus').textContent = 'Using default settings';
  }
  selectedSlideId = project.slides[0]?.id || null;
  const transition = () => project.transitions[selected] || null;
  const activeSlide = () => M.findSlide(project, selectedSlideId) || null;
  const serialize = () => JSON.stringify(project);
  const format = n => Number(n.toFixed(2)).toString();
  const pad = n => String(n).padStart(2, '0');
  const keyTime = { start: 0, middle: .5, end: 1 };
  const motionUnits = { speed: '×', size: 'px', ripple: '%', boost: '×', refinement: '%', settle: '%' };
  const viewState = () => ({ mode, selectedSlideId, transitionId: transition()?.id, keyframe, progress });
  const snapshot = () => ({ project: serialize(), view: viewState() });

  function toast(message, allowUndo = false) {
    clearTimeout(toastTimer); $('toast').replaceChildren(document.createTextNode(message)); $('toast').hidden = false;
    if (allowUndo) {
      const button = document.createElement('button'); button.textContent = 'Undo'; button.id = 'toastUndo';
      button.addEventListener('click', () => { restoreHistory(false); $('toast').hidden = true; });
      $('toast').appendChild(button);
    }
    toastTimer = setTimeout(() => { $('toast').hidden = true; }, allowUndo ? 8000 : 4500);
  }
  function save() {
    clearTimeout(saveTimer);
    try { localStorage.setItem(storageKey, serialize()); $('saveStatus').textContent = 'Saved on this device'; }
    catch { $('saveStatus').textContent = 'Unsaved · use Export'; }
  }
  function queueSave() {
    $('saveStatus').textContent = 'Saving…'; clearTimeout(saveTimer); saveTimer = setTimeout(save, 250);
  }
  function historyUI() {
    $('undo').disabled = undoStack.length === 0 && pendingEdit === null;
    $('redo').disabled = redoStack.length === 0;
  }
  function beginEdit() {
    if (pendingEdit === null) {
      if ($('toastUndo')) $('toast').hidden = true;
      pendingEdit = snapshot();
    }
  }
  function commitEdit() {
    if (pendingEdit !== null && pendingEdit.project !== serialize()) {
      undoStack.push(pendingEdit); if (undoStack.length > 100) undoStack.shift();
      redoStack = []; save();
    }
    pendingEdit = null; historyUI();
  }
  function anchorSelectedSlide() {
    const index = Math.max(0, project.slides.findIndex(slide => slide.id === selectedSlideId));
    selected = Math.max(0, Math.min(index, project.transitions.length - 1));
    progress = project.transitions.length && index === project.slides.length - 1 ? 1 : 0;
    keyframe = progress === 1 ? 'end' : 'start';
  }
  function restoreView(view) {
    mode = view.mode; selectedSlideId = M.findSlide(project, view.selectedSlideId)?.id || project.slides[0]?.id || null;
    const trIndex = project.transitions.findIndex(tr => tr.id === view.transitionId);
    if (mode === 'transition' && trIndex >= 0) {
      selected = trIndex; keyframe = view.keyframe; progress = view.progress;
    } else { mode = 'slide'; anchorSelectedSlide(); }
  }
  function edit(action) {
    commitEdit(); pause(); beginEdit(); const before = pendingEdit.project; action(); commitEdit(); syncInspector(); render();
    return before !== serialize();
  }
  function restoreHistory(isRedo) {
    if (presenting) return;
    $('toast').hidden = true;
    pause(); commitEdit();
    const source = isRedo ? redoStack : undoStack, target = isRedo ? undoStack : redoStack;
    if (!source.length) return;
    target.push(snapshot()); const saved = source.pop();
    project = JSON.parse(saved.project); restoreView(saved.view);
    save(); syncInspector(); historyUI(); render();
  }
  function setPressed(element, value) {
    element.classList.toggle('active', value); element.setAttribute('aria-pressed', String(value));
  }
  function node(tag, className, text) {
    const element = document.createElement(tag); if (className) element.className = className;
    if (text !== undefined) element.textContent = text; return element;
  }
  function updateMiniature(element, slide) {
    const space = slide.space, opening = element.querySelector('.mini-opening');
    Object.assign(opening.style, { left: space.x + '%', top: space.y + '%', width: space.width + '%', height: space.height + '%', transform: 'translate(-50%, -50%) rotate(' + space.rotation + 'deg)' });
    element.querySelector('.mini-text').textContent = slide.content.heading;
    element.querySelector('.slide-name').textContent = slide.name;
    element.querySelector('[data-slide]').setAttribute('aria-label', 'Select slide ' + (project.slides.indexOf(slide) + 1) + ': ' + slide.name);
  }
  function renderSidebar() {
    const list = $('slideList'); list.replaceChildren();
    project.slides.forEach((slide, index) => {
      const card = node('div', 'slide-card');
      card.dataset.card = slide.id;
      card.classList.toggle('selected', mode === 'slide' && selectedSlideId === slide.id);
      const button = node('button', 'slide-select'); button.dataset.slide = slide.id;
      button.setAttribute('aria-pressed', String(mode === 'slide' && selectedSlideId === slide.id));
      const thumb = node('span', 'slide-miniature'); thumb.setAttribute('aria-hidden', 'true');
      thumb.append(node('i', 'mini-opening'), node('span', 'mini-text'));
      const label = node('span', 'slide-card-label'); label.append(node('span', 'slide-number', pad(index + 1)), node('span', 'slide-name', slide.name));
      button.append(thumb, label); card.append(button); list.append(card); updateMiniature(card, slide);
      if (index < project.transitions.length) {
        const tr = project.transitions[index], connector = node('button', 'slide-connector');
        connector.dataset.transition = String(index);
        connector.classList.toggle('selected', mode === 'transition' && selected === index);
        connector.setAttribute('aria-pressed', String(mode === 'transition' && selected === index));
        connector.setAttribute('aria-label', 'Edit transition ' + (index + 1) + ': ' + slide.name + ' to ' + project.slides[index + 1].name);
        connector.append(node('span', '', '↔'), node('span', '', 'Cloud reshape'), node('span', 'connector-time', format(tr.duration) + 's'));
        list.append(connector);
      }
    });
    if (!project.slides.length) list.append(node('p', 'empty-list', 'Your slide sequence will appear here.'));
    $('slideCount').textContent = project.slides.length + (project.slides.length === 1 ? ' slide' : ' slides');
    $('addSlide').disabled = project.slides.length >= M.MAX_SLIDES;
  }
  function syncHeading() {
    const slide = activeSlide(), tr = transition();
    $('transitionNumber').textContent = mode === 'slide' ? (slide ? 'SLIDE ' + pad(project.slides.indexOf(slide) + 1) : 'YOUR PRESENTATION') : 'TRANSITION ' + pad(selected + 1);
    $('transitionTitle').textContent = mode === 'slide' ? slide?.name || 'Start your presentation' : 'Cloud reshape';
    $('frameDescription').textContent = mode === 'transition' && tr ? M.findSlide(project, tr.from).name + ' → ' + M.findSlide(project, tr.to).name : slide ? slide.name + ' · Blue clouds' : 'No slides yet';
  }
  function syncInspector() {
    const slide = activeSlide(), tr = transition(), hasSlides = !!slide;
    const space = mode === 'slide' ? slide?.space || M.defaultSpace : M.getSpace(project, selected, keyframe);
    syncHeading(); renderSidebar();
    $('presentationName').value = project.title;
    $('inspectorTitle').textContent = mode === 'slide' ? 'Edit this slide' : 'Shape the transition';
    $('slideName').value = slide?.name || '';
    $('labelInput').value = slide?.content.label || '';
    $('headingInput').value = slide?.content.heading || '';
    $('bodyInput').value = slide?.content.body || '';
    $('sourceInput').value = slide?.content.source || '';
    $('qrToggle').checked = slide?.content.qr === 'accytutor';
    $('slideBadge').textContent = pad(project.slides.indexOf(slide) + 1);
    $('slideFields').hidden = !hasSlides; $('emptyInspector').hidden = hasSlides;
    $('tab-space').disabled = !hasSlides; $('tab-motion').disabled = !tr;
    $('resetTransition').disabled = !hasSlides;
    $('resetTransition').textContent = mode === 'slide' ? '↺ Reset slide layout' : '↺ Reset transition';
    $('timeline').hidden = mode !== 'transition' || !tr;
    $('slideToolbar').hidden = mode === 'transition' || !hasSlides;
    $('keyframeSelector').hidden = mode === 'slide';
    $('pathSettings').hidden = mode === 'slide';
    $('keyframeBadge').textContent = mode === 'slide' ? 'SLIDE' : keyframe.toUpperCase();
    $('keyframeHelp').textContent = mode === 'slide'
      ? 'This slide’s layout is shared by its incoming and outgoing transitions.'
      : keyframe === 'middle' ? 'An independent waypoint for this transition. The endpoint layouts stay with their slides.'
      : 'Edits “' + M.findSlide(project, keyframe === 'start' ? tr.from : tr.to).name + '”. This layout is shared wherever the slide appears.';
    all('[data-keyframe]').forEach(button => {
      const active = button.dataset.keyframe === keyframe;
      button.classList.toggle('selected', active); button.setAttribute('aria-pressed', String(active));
    });
    all('[data-space]').forEach(input => {
      input.value = space[input.dataset.space]; input.disabled = !hasSlides;
      $(input.id + 'Value').textContent = format(space[input.dataset.space]) + (input.dataset.space === 'rotation' ? '°' : '%');
    });
    all('[data-motion]').forEach(input => {
      const value = (tr?.motion || M.defaultMotion)[input.dataset.motion];
      input.value = value; input.disabled = !tr;
      $(input.id + 'Value').textContent = format(value) + motionUnits[input.dataset.motion];
    });
    $('duration').value = tr?.duration || M.defaultDuration; $('duration').disabled = !tr;
    $('durationValue').textContent = format(tr?.duration || M.defaultDuration) + 's';
    $('totalTime').textContent = (tr?.duration || 0).toFixed(2) + 's';
    $('easing').value = tr?.easing || 'smooth';
    const slideIndex = project.slides.indexOf(slide);
    $('moveSlideUp').disabled = slideIndex <= 0;
    $('moveSlideDown').disabled = slideIndex < 0 || slideIndex === project.slides.length - 1;
    $('duplicateSlide').disabled = !hasSlides || project.slides.length >= M.MAX_SLIDES;
    $('deleteSlide').disabled = !hasSlides; $('present').disabled = !hasSlides;
    $('previousSlide').disabled = slideIndex <= 0;
    $('nextSlide').disabled = slideIndex === project.slides.length - 1;
    $('editTransition').disabled = !tr;
    $('editTransition').textContent = slideIndex === project.slides.length - 1 ? 'Edit incoming transition' : 'Edit transition →';
    $('slidePosition').textContent = 'Slide ' + (slideIndex + 1) + ' of ' + project.slides.length;
    $('slideToolbarHint').textContent = tr ? 'Edit this slide, or shape what happens next.' : 'Add another slide to create a transition.';
    $('sampleToggle').disabled = !hasSlides; $('guidesToggle').disabled = !hasSlides;
    syncMotionProfile();
    if (!hasSlides) setTab('slide');
    else if (!tr && $('tab-motion').getAttribute('aria-selected') === 'true') setTab('slide');
  }
  function syncMotionProfile() {
    const tr = transition();
    let match = null;
    if (tr) for (const [key, preset] of Object.entries(M.motionPresets)) {
      if (tr.easing === 'smooth' && tr.duration === preset.duration && ['speed', 'boost', 'ripple', 'refinement', 'settle'].every(name => Math.abs(tr.motion[name] - preset[name]) < .001)) match = key;
    }
    all('[data-preset]').forEach(button => {
      const active = button.dataset.preset === match;
      button.classList.toggle('selected', active); button.setAttribute('aria-pressed', String(active)); button.disabled = !tr;
    });
    $('motionPresetBadge').textContent = match ? M.motionPresets[match].label.toUpperCase() : 'CUSTOM';
    const motion = tr?.motion || M.defaultMotion;
    const points = Array.from({length:61}, (_, i) => (i ? 'L' : 'M') + (i*4).toFixed(1) + ' ' + (48-M.motionEnvelope(motion,i/60)*40).toFixed(2));
    $('motionCurve').setAttribute('d', points.join(' '));
    $('settleHint').textContent = 'The last ' + ((tr?.duration || M.defaultDuration) * motion.settle / 100).toFixed(2) + 's gives the movement room to settle.';
  }
  function chooseSlide(id, tabName = 'slide') {
    commitEdit(); pause(); selectedSlideId = id; mode = 'slide'; anchorSelectedSlide();
    setTab(tabName); syncInspector(); render();
  }
  function chooseKeyframe(value) {
    if (!transition()) return;
    commitEdit(); pause(); mode = 'transition'; keyframe = value; progress = keyTime[value];
    selectedSlideId = value === 'end' ? transition().to : transition().from;
    setTab('space'); syncInspector(); render();
  }
  function chooseTransition(index, tabName = 'space') {
    if (!project.transitions[index]) return;
    commitEdit(); pause(); mode = 'transition'; selected = index; selectedSlideId = transition().from;
    keyframe = 'start'; progress = 0; setTab(tabName); syncInspector(); render();
  }
  function setTab(name, focus = false) {
    all('[data-tab]').forEach(button => {
      const active = button.dataset.tab === name;
      button.setAttribute('aria-selected', String(active)); button.tabIndex = active ? 0 : -1;
      $('panel-' + button.dataset.tab).hidden = !active;
      if (active && focus) button.focus();
    });
    document.querySelector('.inspector-scroll').scrollTop = 0;
  }
  function placeBox(element, box) {
    element.style.left = box.x + 'px'; element.style.top = box.y + 'px';
    element.style.width = box.width + 'px'; element.style.height = box.height + 'px';
    element.style.transform = 'translate(-50%, -50%)';
  }
  function renderContent(space) {
    const rect = $('stage').getBoundingClientRect();
    placeBox($('spaceGuide'), { x: space.x / 100 * rect.width, y: space.y / 100 * rect.height, width: space.width / 100 * rect.width, height: space.height / 100 * rect.height });
    $('spaceGuide').style.transform += ' rotate(' + space.rotation + 'deg)';
    $('spaceGuide').hidden = !guides || presenting;
    const safe = M.safeBox(space, rect.width, rect.height);
    placeBox($('safeGuide'), safe); $('safeGuide').hidden = !guides || !showSafe || presenting;
    const contentBox = { ...safe, width: safe.width * .88, height: safe.height * .86 };
    placeBox($('sampleContent'), contentBox); placeBox($('slideContent'), contentBox);
    const tr = transition();
    const contentSlide = mode === 'slide' && !presenting ? activeSlide() : tr ? M.findSlide(project, progress < .5 ? tr.from : tr.to) : project.slides[0];
    const showSample = sample && !presenting;
    const visibility = mode === 'slide' && !presenting ? 1 : M.contentOpacity(tr, progress);
    $('sampleContent').hidden = !showSample; $('sampleContent').style.opacity = visibility;
    $('sampleContent').setAttribute('aria-hidden', String(!showSample || visibility < .1));
    const content = contentSlide?.content || {};
    const hasQr = content.qr === 'accytutor';
    $('slideContent').classList.toggle('has-qr', hasQr);
    $('slideQr').hidden = !hasQr;
    const label = content.label || '';
    for (const [id, value] of [['slideLabel', label], ['slideHeading', content.heading], ['slideSource', content.source]]) {
      if ($(id).textContent !== (value || '')) $(id).textContent = value || '';
      $(id).hidden = !value;
    }
    const body = content.body || '';
    if ($('slideBody').dataset.bodySource !== body) {
      let href = null;
      if (/^https?:\/\/\S+$/i.test(body.trim())) {
        try { href = new URL(body.trim()).href; } catch { /* Leave incomplete URLs as text while editing. */ }
      }
      if (href) {
        const link = document.createElement('a');
        link.href = href; link.textContent = body; link.target = '_blank'; link.rel = 'noopener noreferrer';
        $('slideBody').replaceChildren(link);
      } else {
        const fragment = document.createDocumentFragment();
        let cursor = 0;
        for (const match of body.matchAll(/\*([^*\n]+)\*/g)) {
          fragment.append(document.createTextNode(body.slice(cursor, match.index)));
          const emphasis = document.createElement('em');
          emphasis.textContent = match[1];
          fragment.append(emphasis);
          cursor = match.index + match[0].length;
        }
        fragment.append(document.createTextNode(body.slice(cursor)));
        $('slideBody').replaceChildren(fragment);
      }
      $('slideBody').dataset.bodySource = body;
    }
    $('slideBody').hidden = !body;
    // Keep the same type proportions in both wide and tall presentation windows.
    $('slideContent').style.setProperty('--type-unit', Math.min(rect.width, rect.height * 1.6) / 100 + 'px');
    const authored = !!(label || content.heading || content.body || content.source || hasQr) && !showSample;
    $('slideContent').hidden = !authored; $('slideContent').style.opacity = visibility;
    $('slideContent').setAttribute('aria-hidden', String(!authored || visibility < .1));
    const overflowing = $('slideContent').scrollHeight > $('slideContent').clientHeight + 1
      || $('slideCopy').scrollHeight > $('slideContent').clientHeight + 1;
    $('contentOverflow').hidden = !authored || mode !== 'slide' || !overflowing;
  }
  function render() {
    const hasSlides = project.slides.length > 0, tr = transition();
    $('emptyStage').hidden = hasSlides; $('clouds').hidden = !hasSlides;
    if (hasSlides) {
      const offset = presenting ? presentationTime - M.sampleTime(project, selected, progress) : 0;
      const shape = renderer.draw(project, selected, progress, offset);
      renderContent(shape);
    } else {
      ['spaceGuide', 'safeGuide', 'sampleContent', 'slideContent'].forEach(id => { $(id).hidden = true; });
    }
    $('scrubber').value = Math.round(progress * 1000);
    $('scrubber').setAttribute('aria-valuetext', Math.round(progress * 100) + '% · ' + (progress * (tr?.duration || 0)).toFixed(2) + ' seconds');
    $('motionPlayhead').setAttribute('x1', String(progress * 240)); $('motionPlayhead').setAttribute('x2', String(progress * 240));
    const phaseEnd = 1 - (tr?.motion.settle ?? M.defaultMotion.settle) / 100;
    $('motionPhase').textContent = progress === 0 ? 'Ready' : progress === 1 ? 'At rest' : progress < M.motionPhases(tr?.motion || M.defaultMotion).peak ? 'Gathering' : progress < phaseEnd ? 'Gliding' : 'Settling';
    $('currentTime').value = (progress * (tr?.duration || 0)).toFixed(2);
    $('stageState').textContent = playing ? '● Playing transition' : mode === 'slide' ? '○ Slide preview' : '○ Preview paused';
    $('play').textContent = playing ? 'Ⅱ' : '▶'; $('play').setAttribute('aria-label', playing ? 'Pause transition' : 'Play transition');
    if (presenting) {
      $('presentSlideLabel').textContent = pad(presentSlide + 1) + ' / ' + pad(project.slides.length);
      $('presentPrevious').disabled = playing || presentSlide === 0;
      $('presentNext').disabled = playing || project.slides.length < 2;
      $('presentNext').textContent = presentSlide === project.slides.length - 1 ? 'Replay ↺' : 'Next slide →';
    }
  }
  function updateSample() {
    const examples = {
      title: '<span class="sample-eyebrow">An idea, in focus</span><h4>A clearer<br>perspective.</h4><p>A little space makes room<br>for the story to land.</p>',
      metric: '<span class="sample-eyebrow">Example metric</span><strong class="metric">72<span style="font-size:.48em">%</span></strong><p>A headline number.<br>Context that gives it meaning.</p>',
      chart: '<span class="sample-eyebrow">Illustrative data</span><h4 style="font-size:2.6cqw">A pattern emerges.</h4><svg viewBox="0 0 300 140" role="img" aria-label="Sample bar chart: Q1 28, Q2 46, Q3 62, Q4 84"><path d="M12 110H288 M12 75H288 M12 40H288" fill="none" stroke="#e5ebf2"/><g fill="#93b9ec"><rect x="30" y="82" width="34" height="28" rx="2"/><rect x="95" y="64" width="34" height="46" rx="2"/><rect x="160" y="48" width="34" height="62" rx="2"/></g><rect x="225" y="26" width="34" height="84" rx="2" fill="#285bf1"/><g fill="#7c91a8" font-size="10" text-anchor="middle" font-family="sans-serif"><text x="47" y="128">Q1</text><text x="112" y="128">Q2</text><text x="177" y="128">Q3</text><text x="242" y="128">Q4</text></g></svg>'
    };
    $('sampleContent').innerHTML = examples[sampleType];
    setPressed($('sampleToggle'), sample);
    $('showContent').textContent = sample ? 'Hide layout sample' : 'Show layout sample';
    render();
  }
  function schedule() {
    if ((playing || (presenting && !reducedMotion.matches)) && !document.hidden && frame === null) frame = requestAnimationFrame(tick);
  }
  function tick(now) {
    frame = null;
    const dt = last ? Math.max(0, (now - last) / 1000) : 0; last = now;
    const wasPlaying = playing, priorTime = M.sampleTime(project, selected, progress), tr = transition();
    if (playing && tr) {
      if (loopHold > 0) { loopHold -= dt; if (loopHold <= 0) progress = 0; }
      else {
        progress = M.clamp(progress + dt * rate * direction / tr.duration);
        if ((direction > 0 && progress === 1) || (direction < 0 && progress === 0)) {
          if (loop && !presenting) loopHold = .45;
          else playing = false;
        }
      }
    } else if (presenting && !reducedMotion.matches) presentationTime += dt * M.slideRestStyle(project, presentSlide).speed;
    if (presenting && wasPlaying) presentationTime += Math.abs(M.sampleTime(project, selected, progress) - priorTime);
    render(); schedule();
  }
  function pause() {
    playing = false; last = 0; loopHold = 0;
    if (frame !== null) { cancelAnimationFrame(frame); frame = null; }
  }
  function play(restart = false) {
    if (!transition()) return;
    commitEdit();
    if (mode === 'slide') { mode = 'transition'; setTab('space'); syncInspector(); }
    if (restart || progress >= 1) progress = 0;
    direction = 1; playing = true; loopHold = 0; last = 0; render(); schedule();
  }
  function enterPresentation() {
    if (!project.slides.length) return;
    commitEdit(); pause(); editorView = viewState();
    $('toast').hidden = true; clearTimeout(toastTimer);
    presenting = true; presentSlide = 0; selected = 0; progress = 0; rate = 1;
    presentationTime = M.sampleTime(project, selected, progress);
    document.body.classList.add('presenting');
    $('exitPresent').hidden = false; $('presentationControls').hidden = false;
    fitStage(); render(); schedule(); $('exitPresent').focus();
  }
  function exitPresentation() {
    pause(); presenting = false; document.body.classList.remove('presenting');
    $('exitPresent').hidden = true; $('presentationControls').hidden = true;
    if (editorView) restoreView(editorView);
    rate = Number($('playbackRate').value); syncInspector(); fitStage(); render(); $('present').focus();
  }
  function presentationStep(delta) {
    if (playing || project.slides.length < 2) return;
    pause();
    if (delta > 0 && presentSlide === project.slides.length - 1) {
      selected = 0; progress = 0; presentSlide = 0; presentationTime = 18; render(); schedule(); return;
    }
    const target = M.clamp(presentSlide + delta, 0, project.slides.length - 1);
    if (target === presentSlide) { schedule(); return; }
    selected = delta > 0 ? presentSlide : target;
    direction = delta > 0 ? 1 : -1; progress = delta > 0 ? 0 : 1; presentSlide = target;
    if (reducedMotion.matches) progress = delta > 0 ? 1 : 0;
    else playing = true;
    last = 0; render(); schedule();
  }
  function addSlide() {
    if (project.slides.length >= M.MAX_SLIDES) return;
    edit(() => { selectedSlideId = M.insertSlide(project, selectedSlideId); mode = 'slide'; anchorSelectedSlide(); setTab('slide'); });
    $('slideName').focus(); $('slideName').select();
  }

  $('addSlide').addEventListener('click', addSlide); $('addFirstSlide').addEventListener('click', addSlide);
  $('slideList').addEventListener('click', event => {
    const slide = event.target.closest('[data-slide]'), tr = event.target.closest('[data-transition]');
    if (slide) chooseSlide(slide.dataset.slide);
    else if (tr) chooseTransition(Number(tr.dataset.transition));
  });
  $('duplicateSlide').addEventListener('click', () => {
    if (!activeSlide() || project.slides.length >= M.MAX_SLIDES) return;
    edit(() => { selectedSlideId = M.duplicateSlide(project, selectedSlideId); mode = 'slide'; anchorSelectedSlide(); setTab('slide'); });
    toast('Slide duplicated. Its text and layout are independent of the original.');
  });
  $('deleteSlide').addEventListener('click', () => {
    if (!activeSlide()) return;
    const name = activeSlide().name;
    edit(() => { selectedSlideId = M.deleteSlide(project, selectedSlideId); mode = 'slide'; anchorSelectedSlide(); setTab('slide'); });
    toast('Deleted “' + name + '”.', true);
    if (!project.slides.length) $('addFirstSlide').focus();
  });
  [['moveSlideUp', -1], ['moveSlideDown', 1]].forEach(([id, delta]) => {
    $(id).addEventListener('click', () => edit(() => { M.moveSlide(project, selectedSlideId, delta); mode = 'slide'; anchorSelectedSlide(); }));
  });
  [['previousSlide', -1], ['nextSlide', 1]].forEach(([id, delta]) => {
    $(id).addEventListener('click', () => {
      const index = project.slides.findIndex(slide => slide.id === selectedSlideId), target = project.slides[index + delta];
      if (target) chooseSlide(target.id);
    });
  });
  $('editTransition').addEventListener('click', () => chooseTransition(selected));
  $('qrToggle').addEventListener('change', event => {
    if (activeSlide()) edit(() => { activeSlide().content.qr = event.target.checked ? 'accytutor' : 'none'; });
  });
  [
    ['presentationName', value => { project.title = value || 'Untitled presentation'; }],
    ['slideName', value => { if (activeSlide()) activeSlide().name = value || 'Untitled slide'; }],
    ['labelInput', value => { if (activeSlide()) activeSlide().content.label = value; }],
    ['headingInput', value => { if (activeSlide()) activeSlide().content.heading = value; }],
    ['bodyInput', value => { if (activeSlide()) activeSlide().content.body = value; }],
    ['sourceInput', value => { if (activeSlide()) activeSlide().content.source = value; }]
  ].forEach(([id, apply]) => {
    $(id).addEventListener('input', event => {
      beginEdit(); pause(); apply(event.target.value);
      if (['labelInput', 'headingInput', 'bodyInput', 'sourceInput'].includes(id)) { sample = false; setPressed($('sampleToggle'), false); $('showContent').textContent = 'Show layout sample'; }
      queueSave(); historyUI(); syncHeading();
      const card = all('[data-card]').find(element => element.dataset.card === selectedSlideId);
      if (card && activeSlide()) updateMiniature(card, activeSlide());
      if (id === 'slideName') all('[data-transition]').forEach(button => {
        const i = Number(button.dataset.transition);
        button.setAttribute('aria-label', 'Edit transition ' + (i + 1) + ': ' + project.slides[i].name + ' to ' + project.slides[i + 1].name);
      });
      render();
    });
    $(id).addEventListener('change', commitEdit);
    $(id).addEventListener('blur', () => {
      if (id === 'presentationName') $(id).value = project.title;
      if (id === 'slideName') $(id).value = activeSlide()?.name || '';
      commitEdit();
    });
  });
  all('[data-keyframe]').forEach(button => button.addEventListener('click', () => chooseKeyframe(button.dataset.keyframe)));
  all('[data-tab]').forEach(button => {
    function activate(name, focus = false) {
      if (name === 'slide' && mode === 'transition') { chooseSlide(selectedSlideId); if (focus) $('tab-slide').focus(); }
      else if (name === 'motion' && mode === 'slide') { chooseTransition(selected, 'motion'); if (focus) $('tab-motion').focus(); }
      else setTab(name, focus);
    }
    button.addEventListener('click', () => activate(button.dataset.tab));
    button.addEventListener('keydown', event => {
      const tabs = all('[data-tab]').filter(item => !item.disabled).map(item => item.dataset.tab), index = tabs.indexOf(button.dataset.tab);
      if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
        event.preventDefault(); event.stopPropagation();
        activate(event.key === 'Home' ? tabs[0] : event.key === 'End' ? tabs.at(-1) : tabs[(index + (event.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length], true);
      }
    });
  });
  all('[data-space]').forEach(input => {
    input.addEventListener('input', () => {
      if (!activeSlide()) return;
      beginEdit(); pause();
      if (mode === 'transition') progress = keyTime[keyframe];
      const space = mode === 'slide' ? activeSlide().space : M.getSpace(project, selected, keyframe);
      space[input.dataset.space] = Number(input.value);
      $(input.id + 'Value').textContent = format(Number(input.value)) + (input.dataset.space === 'rotation' ? '°' : '%');
      const card = all('[data-card]').find(element => element.dataset.card === selectedSlideId);
      if (card) updateMiniature(card, activeSlide());
      queueSave(); historyUI(); render();
    });
    input.addEventListener('change', commitEdit); input.addEventListener('blur', commitEdit);
  });
  all('[data-preset]').forEach(button => button.addEventListener('click', () => {
    if (!transition()) return;
    const changed = edit(() => { M.applyMotionPreset(transition(), button.dataset.preset); });
    toast(M.motionPresets[button.dataset.preset].label + ' motion applied. Your layouts and text are preserved.', changed);
    play(true);
  }));
  all('[data-motion]').forEach(input => {
    input.addEventListener('input', () => {
      if (!transition()) return;
      beginEdit(); const motion = transition().motion;
      motion[input.dataset.motion] = Number(input.value); motion.boost = Math.max(motion.boost, motion.speed);
      all('[data-motion]').forEach(control => {
        control.value = motion[control.dataset.motion];
        $(control.id + 'Value').textContent = format(motion[control.dataset.motion]) + motionUnits[control.dataset.motion];
      });
      syncMotionProfile(); queueSave(); historyUI(); render();
    });
    input.addEventListener('change', commitEdit); input.addEventListener('blur', commitEdit);
  });
  $('duration').addEventListener('input', event => {
    if (!transition()) return;
    beginEdit(); transition().duration = Number(event.target.value);
    $('durationValue').textContent = format(transition().duration) + 's';
    $('totalTime').textContent = transition().duration.toFixed(2) + 's';
    const connector = all('[data-transition]').find(element => Number(element.dataset.transition) === selected);
    if (connector) connector.querySelector('.connector-time').textContent = format(transition().duration) + 's';
    syncMotionProfile(); queueSave(); historyUI(); render();
  });
  $('duration').addEventListener('change', commitEdit); $('duration').addEventListener('blur', commitEdit);
  $('easing').addEventListener('change', event => { if (transition()) edit(() => { transition().easing = event.target.value; }); });
  [['alignLeft', 32.5], ['alignCenter', 50], ['alignRight', 68.5]].forEach(([id, value]) => {
    $(id).addEventListener('click', () => {
      if (!activeSlide()) return;
      edit(() => {
        const space = mode === 'slide' ? activeSlide().space : M.getSpace(project, selected, keyframe);
        space.x = value; if (mode === 'transition') progress = keyTime[keyframe];
      });
    });
  });
  $('resetTransition').addEventListener('click', () => {
    if (!activeSlide()) return;
    const changed = edit(() => {
      if (mode === 'slide') activeSlide().space = M.clone(M.defaultSpace);
      else {
        const tr = transition(), replacement = M.createTransition(M.findSlide(project, tr.from), M.findSlide(project, tr.to));
        replacement.id = tr.id; project.transitions[selected] = replacement;
      }
    });
    toast(mode === 'slide' ? 'Slide layout reset. Your text is preserved.' : 'Transition reset. Slide layouts are preserved.', changed);
  });
  $('play').addEventListener('click', () => { if (playing) { pause(); render(); } else play(); });
  $('replay').addEventListener('click', () => play(true));
  $('loop').addEventListener('click', () => { loop = !loop; setPressed($('loop'), loop); });
  $('playbackRate').addEventListener('change', event => { rate = Number(event.target.value); });
  $('scrubber').addEventListener('input', event => { commitEdit(); pause(); progress = Number(event.target.value) / 1000; render(); });
  $('undo').addEventListener('click', () => restoreHistory(false)); $('redo').addEventListener('click', () => restoreHistory(true));
  $('guidesToggle').addEventListener('click', () => { guides = !guides; setPressed($('guidesToggle'), guides); render(); });
  $('sampleToggle').addEventListener('click', () => { sample = !sample; updateSample(); });
  $('showContent').addEventListener('click', () => { sample = !sample; updateSample(); });
  $('sampleType').addEventListener('change', event => { sampleType = event.target.value; sample = true; updateSample(); });
  $('showSafe').addEventListener('change', event => { showSafe = event.target.checked; render(); });
  $('present').addEventListener('click', enterPresentation); $('exitPresent').addEventListener('click', exitPresentation);
  $('presentPrevious').addEventListener('click', () => presentationStep(-1)); $('presentNext').addEventListener('click', () => presentationStep(1));
  $('exportProject').addEventListener('click', () => {
    commitEdit(); const url = URL.createObjectURL(new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = 'pixel-clouds-presentation.json';
    document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('Presentation exported with all slides, text, and transitions.');
  });
  $('importProject').addEventListener('click', () => $('importFile').click());
  $('importFile').addEventListener('change', async event => {
    const file = event.target.files[0]; if (!file) return;
    try {
      if (file.size > 1024 * 1024) throw new Error('Choose a presentation JSON file under 1 MB.');
      const imported = M.validateProject(JSON.parse(await file.text()));
      const changed = edit(() => { project = imported; selectedSlideId = project.slides[0]?.id || null; mode = 'slide'; anchorSelectedSlide(); setTab('slide'); });
      toast(changed ? 'Presentation imported.' : 'This presentation is already open.', changed);
    } catch (error) { toast(error instanceof SyntaxError ? 'This file is not valid JSON. Choose a Pixel Clouds export.' : error.message); }
    finally { event.target.value = ''; }
  });
  document.querySelector('.brand').addEventListener('click', event => { event.preventDefault(); chooseSlide(project.slides[0]?.id || null); });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && presenting) { exitPresentation(); return; }
    if (event.target.closest('input,textarea,select,[contenteditable]')) return;
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z' && !presenting) { event.preventDefault(); restoreHistory(event.shiftKey); return; }
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (presenting) {
      if (['ArrowRight', 'ArrowDown', 'PageDown', ' '].includes(event.key)) { event.preventDefault(); presentationStep(1); }
      if (['ArrowLeft', 'ArrowUp', 'PageUp'].includes(event.key)) { event.preventDefault(); presentationStep(-1); }
      return;
    }
    if (event.key === ' ' && !event.target.closest('button')) { event.preventDefault(); if (playing) { pause(); render(); } else play(); }
    if (event.key.toLowerCase() === 'r') { event.preventDefault(); play(true); }
    if (['ArrowLeft', 'ArrowRight'].includes(event.key) && !event.target.closest('[role=tab]')) {
      event.preventDefault();
      if (mode === 'slide') {
        const target = project.slides[project.slides.findIndex(slide => slide.id === selectedSlideId) + (event.key === 'ArrowRight' ? 1 : -1)];
        if (target) chooseSlide(target.id);
      } else if (transition()) { pause(); progress = M.clamp(progress + (event.key === 'ArrowRight' ? 1 : -1) / (30 * transition().duration)); render(); }
    }
  });
  let touchStart = null, wheelTotal = 0, wheelLast = 0;
  $('stage').addEventListener('pointerdown', event => { if (presenting && event.pointerType === 'touch' && !event.target.closest('button')) touchStart = { x: event.clientX, y: event.clientY }; });
  $('stage').addEventListener('pointerup', event => {
    if (!touchStart) return;
    const dx = touchStart.x - event.clientX, dy = touchStart.y - event.clientY; touchStart = null;
    const delta = Math.abs(dx) > Math.abs(dy) ? dx : dy;
    if (Math.abs(delta) > 45) presentationStep(delta > 0 ? 1 : -1);
  });
  $('stage').addEventListener('pointercancel', () => { touchStart = null; });
  $('stage').addEventListener('wheel', event => {
    if (!presenting || event.ctrlKey || playing) return;
    event.preventDefault(); const now = performance.now(); if (now - wheelLast < 500) return;
    wheelTotal += event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? innerHeight : 1);
    if (Math.abs(wheelTotal) > 80) { presentationStep(wheelTotal > 0 ? 1 : -1); wheelTotal = 0; wheelLast = now; }
  }, { passive: false });
  function refreshVisibleCanvas() { if (!document.hidden) { last = 0; renderer.resize(); render(); schedule(); } }
  document.addEventListener('visibilitychange', refreshVisibleCanvas);
  window.addEventListener('pageshow', refreshVisibleCanvas); window.addEventListener('focus', refreshVisibleCanvas);
  $('clouds').addEventListener('contextrestored', refreshVisibleCanvas);
  window.addEventListener('pagehide', () => { if (pendingEdit !== null) save(); });
  reducedMotion.addEventListener('change', event => {
    if (event.matches) {
      pause();
      if (presenting && transition()) progress = project.slides[presentSlide].id === transition().from ? 0 : 1;
      render();
    } else schedule();
  });
  function fitStage() {
    const area = document.querySelector('.stage-area'), caption = document.querySelector('.stage-caption');
    if (presenting) { $('stage').style.width = '100%'; $('stage').style.height = '100%'; }
    else {
      const style = getComputedStyle(area), availableHeight = area.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom) - caption.offsetHeight;
      const stageWidth = Math.min(area.clientWidth, Math.max(120, availableHeight) * 1.6);
      $('stage').style.width = stageWidth + 'px'; $('stage').style.height = stageWidth / 1.6 + 'px'; caption.style.width = stageWidth + 'px';
    }
    renderer.resize(); render();
  }
  new ResizeObserver(fitStage).observe(document.querySelector('.stage-area'));
  anchorSelectedSlide(); renderer.resize(); syncInspector(); updateSample(); historyUI();
  if (migrated) save();
  if (loadMessage) toast(loadMessage);
})();
