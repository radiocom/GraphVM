const p = gvm();
const W = 400, H = 300;
const COLS = 7, CELL_W = 56, CELL_H = 46;
const GRID_X = 4, GRID_Y = 66;
const DAYS_IN_FEB = 28;
const START_DOW = 0; // Feb 2026 starts on Sunday
const TODAY = 11;

p.setWindow(0, 0, W, H, 30, 30, 46);

p.setColor(80, 60, 180);
p.rectFill(0, 0, W, 40);

p.setColor(50, 50, 70);
p.rectFill(0, 42, W, 22);

p.setColor(40, 40, 56);
p.rectFill(0, 280, W, 20);

const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
for (let i = 0; i < COLS; i++) {
  const x = GRID_X + i * CELL_W + 10;
  if (i === 0) p.setColor(180, 80, 80);
  else if (i === 6) p.setColor(80, 80, 180);
  else p.setColor(140, 140, 160);
  p.text(x, 58, dayNames[i]);
}

p.setColor(60, 60, 80);
for (let row = 0; row <= 4; row++) {
  p.rectFill(0, GRID_Y + row * CELL_H, W, 1);
}
for (let col = 1; col < COLS; col++) {
  p.rectFill(GRID_X + col * CELL_W - 2, 42, 1, 254);
}

for (let day = 1; day <= DAYS_IN_FEB; day++) {
  const idx = day - 1 + START_DOW;
  const col = idx % COLS;
  const row = Math.floor(idx / COLS);
  const cx = GRID_X + col * CELL_W;
  const cy = GRID_Y + row * CELL_H + 2;

  if (day === TODAY) {
    p.setColor(0, 180, 120);
  } else if (col === 0) {
    p.setColor(100, 80, 160);
  } else if (col === 6) {
    p.setColor(60, 60, 120);
  } else {
    p.setColor(70, 70, 100);
  }
  p.rectFill(cx, cy, CELL_W - 4, CELL_H - 4);

  if (day === TODAY) p.setColor(255, 255, 255);
  else if (col === 0) p.setColor(255, 255, 255);
  else if (col === 6) p.setColor(180, 180, 255);
  else p.setColor(200, 200, 220);

  p.text(cx + 4, cy + 18, String(day));
}

p.setColor(255, 255, 255);
p.text(140, 28, 'February 2026');

p.setColor(80, 200, 160);
p.text(12, 294, 'Today: Feb 11');

return p;
