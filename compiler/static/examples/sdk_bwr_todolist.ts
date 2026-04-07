const p = gvm();
const W = 400, H = 300;

p.setWindow(0, 0, W, H, 255, 255, 255);

// ── Header ──
p.setColor(0, 0, 0);
p.rectFill(0, 0, W, 38);
p.setColor(255, 255, 255);
p.text(140, 26, 'My Todo List');

// ── Date ──
p.setColor(255, 0, 0);
p.text(12, 58, 'Feb 14, 2026');
p.setColor(0, 0, 0);
p.text(280, 58, '5 of 8 done');

p.rectFill(0, 66, W, 1);

// ── Todo items ──
const todos = [
  { text: 'Review pull request #42', done: true, priority: false },
  { text: 'Update documentation', done: true, priority: false },
  { text: 'Fix login bug', done: false, priority: true },
  { text: 'Deploy to staging', done: false, priority: true },
  { text: 'Team standup meeting', done: true, priority: false },
  { text: 'Write unit tests', done: false, priority: false },
  { text: 'Code review feedback', done: true, priority: false },
  { text: 'Prepare demo slides', done: true, priority: false },
];

const ROW_H = 28;
const START_Y = 74;

for (let i = 0; i < todos.length; i++) {
  const y = START_Y + i * ROW_H;
  const t = todos[i];

  // Checkbox
  p.setColor(0, 0, 0);
  p.rectFill(16, y, 14, 14);
  if (t.done) {
    p.setColor(255, 255, 255);
    p.rectFill(18, y + 2, 10, 10);
    // Checkmark (simple cross)
    p.setColor(0, 0, 0);
    p.rectFill(20, y + 6, 6, 2);
    p.rectFill(23, y + 3, 2, 8);
  } else {
    p.setColor(255, 255, 255);
    p.rectFill(18, y + 2, 10, 10);
  }

  // Priority marker
  if (t.priority) {
    p.setColor(255, 0, 0);
    p.rectFill(36, y + 2, 4, 10);
  }

  // Text
  if (t.done) {
    p.setColor(0, 0, 0);
  } else if (t.priority) {
    p.setColor(255, 0, 0);
  } else {
    p.setColor(0, 0, 0);
  }
  p.text(46, y + 12, t.text);

  // Separator
  p.setColor(0, 0, 0);
  p.rectFill(12, y + ROW_H - 2, W - 24, 1);
}

// ── Footer ──
p.setColor(0, 0, 0);
p.rectFill(0, 282, W, 1);
p.setColor(255, 0, 0);
p.rectFill(12, 288, 8, 8);
p.setColor(0, 0, 0);
p.text(26, 296, 'High Priority');
p.text(200, 296, '3 remaining');

return p;
