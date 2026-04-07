const p = gvm();
const W = 400, H = 300;
const COLS = 7, CELL_W = 56, CELL_H = 40;
const GRID_X = 4, GRID_Y = 60;
const DAYS_IN_FEB = 28;
const START_DOW = 0;
const TODAY = 13;

p.setWindow(0, 0, W, H, 255, 255, 255);

p.setColor(0, 0, 0);
p.rectFill(0, 0, W, 36);

p.setColor(255, 255, 255);
p.text(130, 26, 'February 2026');

const dayNames = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
for (let i = 0; i < COLS; i++) {
  const x = GRID_X + i * CELL_W + 16;
  if (i === 0 || i === 6) p.setColor(255, 0, 0);
  else p.setColor(0, 0, 0);
  p.text(x, 52, dayNames[i]);
}

p.setColor(0, 0, 0);
for (let row = 0; row <= 4; row++) {
  p.rectFill(0, GRID_Y + row * CELL_H, W, 1);
}
for (let col = 1; col < COLS; col++) {
  p.rectFill(GRID_X + col * CELL_W, 38, 1, GRID_Y + 4 * CELL_H - 38);
}

for (let day = 1; day <= DAYS_IN_FEB; day++) {
  const idx = day - 1 + START_DOW;
  const col = idx % COLS;
  const row = Math.floor(idx / COLS);
  const cx = GRID_X + col * CELL_W;
  const cy = GRID_Y + row * CELL_H + 2;

  if (day === TODAY) {
    p.setColor(255, 0, 0);
    p.rectFill(cx + 2, cy, CELL_W - 4, CELL_H - 3);
    p.setColor(255, 255, 255);
  } else if (col === 0 || col === 6) {
    p.setColor(255, 0, 0);
  } else {
    p.setColor(0, 0, 0);
  }
  p.text(cx + 16, cy + 22, String(day));
}

p.setColor(0, 0, 0);
p.rectFill(0, 262, W, 1);
p.text(12, 284, 'Today: Feb 13');

p.setColor(255, 0, 0);
p.rectFill(300, 268, 8, 8);
p.setColor(0, 0, 0);
p.text(314, 278, 'Holiday');

return p;
