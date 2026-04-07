const p = gvm();
const W = 800, H = 480;
const COLS = 7, CELL_W = 112, CELL_H = 60;
const GRID_X = 8, GRID_Y = 90;
const DAYS_IN_FEB = 28, START_DOW = 0, TODAY = 14;

p.setWindow(0, 0, W, H, 255, 255, 255);

// Header
p.setColor(0, 0, 0);
p.rectFill(0, 0, W, 56);
p.setColor(255, 255, 255);
p.text(300, 38, 'February 2026');

// Day names
const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
for (let i = 0; i < COLS; i++) {
  const x = GRID_X + i * CELL_W + 36;
  if (i === 0 || i === 6) p.setColor(255, 0, 0);
  else p.setColor(0, 0, 0);
  p.text(x, 78, dayNames[i]);
}

// Grid lines
p.setColor(0, 0, 0);
for (let row = 0; row <= 4; row++)
  p.rectFill(0, GRID_Y + row * CELL_H, W, 1);
for (let col = 1; col < COLS; col++)
  p.rectFill(GRID_X + col * CELL_W, 60, 1, GRID_Y + 4 * CELL_H - 60);

// Day numbers
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
  p.text(cx + 40, cy + 36, String(day));
}

// Bottom section: notes area
p.setColor(0, 0, 0);
p.rectFill(0, 340, W, 2);
p.text(16, 370, 'Notes:');
p.text(16, 400, "Valentine's Day");
p.setColor(255, 0, 0);
p.rectFill(8, 388, 4, 4);

p.setColor(0, 0, 0);
p.text(16, 428, 'Team meeting at 14:00');

// Footer
p.setColor(0, 0, 0);
p.rectFill(0, 454, W, 1);
p.text(16, 474, 'Week 7 of 2026');
p.setColor(255, 0, 0);
p.text(600, 474, 'Today: Feb 14');

return p;
