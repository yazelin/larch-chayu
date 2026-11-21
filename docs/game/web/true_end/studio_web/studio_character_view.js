(function (global) {
  'use strict';

  var motion = global.WalkSway.create();

  function createFacingBody(className) {
    var facing = document.createElement('div');
    facing.className = 'character-facing' + (className ? ' ' + className : '');
    var body = document.createElement('div');
    body.className = 'character-motion';
    facing.appendChild(body);
    return { facing: facing, body: body };
  }

  function createTea(copy, imageSource) {
    var root = document.createElement('div');
    root.className = 'ring-player';
    root.dataset.copy = String(copy);
    root.setAttribute('aria-hidden', 'true');

    var visual = createFacingBody();
    var image = document.createElement('img');
    image.className = 'character-sprite';
    image.src = imageSource;
    image.alt = '';
    image.draggable = false;
    visual.body.appendChild(image);
    root.appendChild(visual.facing);

    return { root: root, facing: visual.facing, body: visual.body, image: image, face: 1 };
  }

  function createStationary(details, person) {
    var visual = createFacingBody('ring-person-body');
    var image = document.createElement('img');
    image.className = 'ring-person-sprite';
    image.src = details.image;
    image.alt = '';
    image.draggable = false;
    image.setAttribute('aria-hidden', 'true');
    image.addEventListener('error', function () { person.classList.add('sprite-missing'); });

    var silhouette = document.createElement('span');
    silhouette.className = 'person-silhouette';
    silhouette.setAttribute('aria-hidden', 'true');
    var fallbackName = document.createElement('span');
    fallbackName.className = 'person-fallback-name';
    fallbackName.textContent = details.name;

    visual.body.append(image, silhouette, fallbackName);
    return visual.facing;
  }

  // 走路晃動的數值在 walk_sway.js（工作室與島上共用；作者 2026-11-21：原本抖得太大太快，調小調慢）
  function advanceWalking(distanceCm, elapsedSeconds, moving, speedCmPerSecond) {
    var cycles = moving && distanceCm > 0 && speedCmPerSecond > 0 ? distanceCm / (speedCmPerSecond * global.WalkSway.WALK.cycle) : 0;
    global.WalkSway.advance(motion, cycles, elapsedSeconds, moving);
  }

  function renderTea(character, layout) {
    character.root.style.left = layout.left + 'px';
    character.root.style.top = layout.top + 'px';
    character.root.style.width = layout.width + 'px';
    character.root.style.height = layout.height + 'px';
    character.root.classList.toggle('walking', layout.walking);

    var face = layout.face < 0 ? -1 : 1;
    if (character.face !== face) {
      character.face = face;
      character.facing.classList.toggle('facing-left', face < 0);
    }
    character.body.style.transform = 'translate3d(0,' + (-motion.lift * layout.height).toFixed(2) + 'px,0) rotate(' + motion.tilt.toFixed(2) + 'deg)';
  }

  global.StudioCharacterView = {
    createTea: createTea,
    createStationary: createStationary,
    advanceWalking: advanceWalking,
    renderTea: renderTea
  };
})(window);
