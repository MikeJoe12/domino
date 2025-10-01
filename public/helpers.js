// helpers.js
// Inject CSS + provide pip rendering helpers.

(function() {
  const css = `
    /* Make each half a positioned container for its own pips */
.domino-half { position: relative; }
.pip { position:absolute; width: var(--pip-size,14px); height: var(--pip-size,14px); background:#000; border-radius:50%; transform:translate(-50%,-50%); }
/* pos-* anchors (tl, tc, tr, ml, mc, mr, bl, bc, br) as before */


    /* 3×3 grid anchors inside EACH HALF (not the whole tile) */
    .pos-tl { left: 25%; top: 25%; }   /* top-left */
    .pos-tc { left: 50%; top: 25%; }   /* top-center */
    .pos-tr { left: 75%; top: 25%; }   /* top-right */

    .pos-ml { left: 25%; top: 50%; }   /* middle-left */
    .pos-mc { left: 50%; top: 50%; }   /* center */
    .pos-mr { left: 75%; top: 50%; }   /* middle-right */

    .pos-bl { left: 25%; top: 75%; }   /* bottom-left */
    .pos-bc { left: 50%; top: 75%; }   /* bottom-center */
    .pos-br { left: 75%; top: 75%; }   /* bottom-right */
  `;
  const styleEl = document.createElement('style');
  styleEl.innerHTML = css;
  document.head.appendChild(styleEl);
})();

// Domino-style pips per side (0..6) — each half independent
// addPipsToHalf(halfEl, value, orientation)
// orientation: 'v' (vertical/double), 'h' (horizontal), or undefined to auto
function addPipsToHalf(halfEl, val, orientation) {
  val = Number(val);
  halfEl.innerHTML = '';

  const add = cls => {
    const d = document.createElement('div');
    d.className = 'pip ' + cls;
    halfEl.appendChild(d);
  };

  // If not passed, try to infer from the closest .domino element
  let isVertical = false;
  if (orientation === 'v') isVertical = true;
  else if (orientation === 'h') isVertical = false;
  else {
    const tile = halfEl.closest('.domino');
    isVertical = !!(tile && tile.classList.contains('vertical'));
  }

  switch (val) {
    case 0: break;
    case 1: add('pos-mc'); break;
    case 2: add('pos-tl'); add('pos-br'); break;
    case 3: add('pos-tl'); add('pos-mc'); add('pos-br'); break;
    case 4: add('pos-tl'); add('pos-tr'); add('pos-bl'); add('pos-br'); break;
    case 5: add('pos-tl'); add('pos-tr'); add('pos-mc'); add('pos-bl'); add('pos-br'); break;

    case 6:
      if (isVertical) {
        // vertical tile (doubles): two COLUMNS
        add('pos-tl'); add('pos-ml'); add('pos-bl');
        add('pos-tr'); add('pos-mr'); add('pos-br');
      } else {
        // horizontal tile (hands): two ROWS
        add('pos-tl'); add('pos-tc'); add('pos-tr');
        add('pos-bl'); add('pos-bc'); add('pos-br');
      }
      break;
  }
}




// Optional helper to build a full tile element
function createDominoTile(a, b, orientation = 'auto') {
  const isDouble = a === b;
  const ori = orientation === 'auto'
    ? (isDouble ? 'vertical' : 'horizontal')
    : (orientation === 'v' ? 'vertical' : 'horizontal');

  const tile = document.createElement('div');
  tile.className = 'domino ' + ori;

  const h1 = document.createElement('div');
  h1.className = 'domino-half';
  addPipsToHalf(h1, a);

  const h2 = document.createElement('div');
  h2.className = 'domino-half';
  addPipsToHalf(h2, b);

  tile.appendChild(h1);
  tile.appendChild(h2);
  return tile;
}
