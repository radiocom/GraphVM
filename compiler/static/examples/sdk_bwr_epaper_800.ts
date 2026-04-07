const p = gvm();
const W = 800, H = 480;

p.setWindow(0, 0, W, H, 255, 255, 255);

// ── Header ──
p.setColor(255, 0, 0);
p.rectFill(0, 0, W, 4);
p.setColor(0, 0, 0);
p.rectFill(0, 4, W, 56);
p.setColor(255, 255, 255);
p.text(24, 40, 'E-Paper News Reader');
p.text(580, 40, 'Feb 14, 2026');

// ── Main article ──
p.setColor(0, 0, 0);
p.text(24, 88, 'GraphVM: A Tiny Virtual Machine');
p.text(24, 112, 'for E-Paper Displays');

p.setColor(255, 0, 0);
p.text(24, 140, 'FEATURED');

p.setColor(0, 0, 0);
p.rectFill(24, 152, 500, 1);
p.text(24, 176, 'GraphVM enables dynamic UI rendering on');
p.text(24, 200, 'resource-constrained MCUs with as little');
p.text(24, 224, 'as 8KB RAM. The bytecode VM supports 2D');
p.text(24, 248, 'graphics primitives, font rendering, and');
p.text(24, 272, 'event-driven partial screen updates.');

// Image placeholder (right side)
p.setColor(0, 0, 0);
p.rectFill(560, 80, 220, 140);
p.setColor(255, 255, 255);
p.rectFill(564, 84, 212, 132);
p.setColor(0, 0, 0);
p.text(608, 150, 'GraphVM');
p.text(624, 174, 'Logo');

// ── Divider ──
p.setColor(0, 0, 0);
p.rectFill(16, 296, W - 32, 2);

// ── News list (3 columns) ──
const articles = [
  { tag: 'TECH', title: 'BLE 5.4 Spec Released', desc: 'New features for IoT' },
  { tag: 'SCIENCE', title: 'Mars Rover Update', desc: 'Sample analysis complete' },
  { tag: 'DEV', title: 'Rust 2.0 Preview', desc: 'Major language update' },
];

const COL_W = 250;
for (let i = 0; i < 3; i++) {
  const x = 24 + i * (COL_W + 16);
  const a = articles[i];

  p.setColor(255, 0, 0);
  p.text(x, 322, a.tag);

  p.setColor(0, 0, 0);
  p.text(x, 350, a.title);
  p.text(x, 374, a.desc);

  if (i < 2) {
    p.rectFill(x + COL_W + 4, 304, 1, 90);
  }
}

// ── Bottom bar ──
p.setColor(0, 0, 0);
p.rectFill(0, 404, W, 2);

// Stats row
p.text(24, 428, 'Articles: 42');
p.text(200, 428, 'Unread: 7');
p.setColor(255, 0, 0);
p.text(380, 428, 'Breaking: 1');

// Footer
p.setColor(0, 0, 0);
p.rectFill(0, 446, W, 1);
p.text(24, 468, 'Powered by GraphVM');
p.text(580, 468, 'Battery: 87%');
p.setColor(255, 0, 0);
p.rectFill(0, H - 4, W, 4);

return p;
