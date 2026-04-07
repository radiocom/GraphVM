const p = gvm();
const W = 800, H = 480;

p.setWindow(0, 0, W, H, 255, 255, 255);

// ── Title bar ──
p.setColor(0, 0, 0);
p.rectFill(0, 0, W, 50);
p.setColor(255, 255, 255);
p.text(300, 34, 'Home Dashboard');

// ── Top row: 4 metric cards ──
const metrics = [
  { label: 'Temperature', value: '23.5 C', warn: false },
  { label: 'Humidity', value: '67%', warn: false },
  { label: 'PM2.5', value: '156', warn: true },
  { label: 'CO2', value: '820 ppm', warn: true },
];
const CARD_W = 186, CARD_H = 90, CARD_Y = 62;

for (let i = 0; i < 4; i++) {
  const x = 10 + i * (CARD_W + 10);
  const m = metrics[i];

  // Card border
  p.setColor(0, 0, 0);
  p.rectFill(x, CARD_Y, CARD_W, 1);
  p.rectFill(x, CARD_Y + CARD_H, CARD_W, 1);
  p.rectFill(x, CARD_Y, 1, CARD_H);
  p.rectFill(x + CARD_W - 1, CARD_Y, 1, CARD_H);

  // Warning highlight
  if (m.warn) {
    p.setColor(255, 0, 0);
    p.rectFill(x + 1, CARD_Y + 1, CARD_W - 2, 3);
  }

  // Label
  p.setColor(0, 0, 0);
  p.text(x + 16, CARD_Y + 30, m.label);

  // Value
  if (m.warn) p.setColor(255, 0, 0);
  else p.setColor(0, 0, 0);
  p.text(x + 16, CARD_Y + 68, m.value);
}

// ── Middle section: Schedule ──
p.setColor(0, 0, 0);
p.rectFill(0, 164, W, 2);
p.text(16, 190, 'Today Schedule - Feb 14');

const schedule = [
  { time: '09:00', event: 'Morning standup', dur: '30min' },
  { time: '10:30', event: 'Code review: PR #287', dur: '1h' },
  { time: '13:00', event: 'Lunch with team', dur: '1h' },
  { time: '14:30', event: 'Sprint planning', dur: '1.5h' },
  { time: '16:00', event: 'Deploy v2.4 to production', dur: '2h' },
];

for (let i = 0; i < schedule.length; i++) {
  const y = 212 + i * 28;
  const s = schedule[i];

  p.setColor(0, 0, 0);
  p.text(24, y, s.time);
  p.text(120, y, s.event);
  p.text(500, y, s.dur);

  if (i < schedule.length - 1) {
    p.rectFill(24, y + 8, 540, 1);
  }
}

// ── Bottom section: Weather + Alerts ──
p.setColor(0, 0, 0);
p.rectFill(0, 366, W, 2);

// Weather (left)
p.text(16, 392, 'Weather');
p.text(16, 420, 'Partly Cloudy  23C / 16C');
p.text(16, 444, 'Wind: NE 12 km/h');

// Divider
p.rectFill(400, 372, 1, 100);

// Alerts (right)
p.text(420, 392, 'Alerts');
p.setColor(255, 0, 0);
p.rectFill(420, 406, 6, 6);
p.text(434, 420, 'PM2.5 exceeds limit (>150)');
p.rectFill(420, 432, 6, 6);
p.text(434, 444, 'CO2 level high (>800 ppm)');

// Footer
p.setColor(0, 0, 0);
p.rectFill(0, 460, W, 1);
p.text(16, 476, 'Last update: 14:30');
p.setColor(255, 0, 0);
p.text(640, 476, '2 Active Alerts');

return p;
