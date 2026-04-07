const p = gvm();
const W = 400, H = 300;

p.setWindow(0, 0, W, H, 255, 255, 255);

// ── Header bar ──
p.setColor(0, 0, 0);
p.rectFill(0, 0, W, 40);
p.setColor(255, 255, 255);
p.text(120, 28, 'Weather Station');

// ── Current temperature (big) ──
p.setColor(255, 0, 0);
p.text(30, 100, '23');

p.setColor(0, 0, 0);
p.text(130, 80, 'C');
p.text(30, 130, 'Partly Cloudy');

// ── Divider ──
p.setColor(0, 0, 0);
p.rectFill(0, 148, W, 2);

// ── 5-day forecast ──
const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
const highs = [24, 22, 19, 21, 25];
const lows = [16, 14, 12, 13, 17];
const COL_W = 80;

for (let i = 0; i < 5; i++) {
  const x = i * COL_W;

  // Day name
  p.setColor(0, 0, 0);
  p.text(x + 24, 172, days[i]);

  // High temp (red)
  p.setColor(255, 0, 0);
  p.text(x + 16, 200, String(highs[i]) + 'H');

  // Low temp (black)
  p.setColor(0, 0, 0);
  p.text(x + 16, 224, String(lows[i]) + 'L');

  // Vertical divider
  if (i > 0) {
    p.rectFill(x, 155, 1, 90);
  }
}

// ── Bottom info bar ──
p.setColor(0, 0, 0);
p.rectFill(0, 252, W, 1);

p.setColor(0, 0, 0);
p.text(12, 274, 'Humidity: 65%');
p.text(200, 274, 'Wind: 12 km/h');

p.setColor(255, 0, 0);
p.text(12, 294, 'Updated: 14:30');

return p;
