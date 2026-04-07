const p = gvm();
const W = 400, H = 300;

p.setWindow(0, 0, W, H, 255, 255, 255);

// ── Title bar ──
p.setColor(255, 0, 0);
p.rectFill(0, 0, W, 36);
p.setColor(255, 255, 255);
p.text(130, 26, 'System Status');

// ── Status cards ──
const cards = [
  { label: 'CPU', value: '42%', warn: false },
  { label: 'MEM', value: '78%', warn: true },
  { label: 'DISK', value: '56%', warn: false },
  { label: 'NET', value: 'OK', warn: false },
];

const CARD_W = 92, CARD_H = 70, GAP = 6, START_X = 8, START_Y = 46;

for (let i = 0; i < 4; i++) {
  const x = START_X + i * (CARD_W + GAP);
  const y = START_Y;
  const c = cards[i];

  // Card border
  p.setColor(0, 0, 0);
  p.rectFill(x, y, CARD_W, 1);
  p.rectFill(x, y + CARD_H, CARD_W, 1);
  p.rectFill(x, y, 1, CARD_H);
  p.rectFill(x + CARD_W - 1, y, 1, CARD_H);

  // Label
  p.setColor(0, 0, 0);
  p.text(x + 28, y + 20, c.label);

  // Value (red if warning)
  if (c.warn) {
    p.setColor(255, 0, 0);
  } else {
    p.setColor(0, 0, 0);
  }
  p.text(x + 22, y + 52, c.value);
}

// ── Recent events ──
p.setColor(0, 0, 0);
p.rectFill(0, 126, W, 2);
p.text(12, 148, 'Recent Events');

const events = [
  { time: '14:23', msg: 'Deploy completed', alert: false },
  { time: '13:45', msg: 'Memory warning: 78%', alert: true },
  { time: '12:00', msg: 'Backup successful', alert: false },
  { time: '09:15', msg: 'Service restarted', alert: true },
  { time: '08:30', msg: 'System boot', alert: false },
];

for (let i = 0; i < events.length; i++) {
  const y = 164 + i * 22;
  const ev = events[i];

  // Alert indicator
  if (ev.alert) {
    p.setColor(255, 0, 0);
    p.rectFill(12, y - 8, 6, 6);
  }

  p.setColor(0, 0, 0);
  p.text(24, y, ev.time);

  if (ev.alert) p.setColor(255, 0, 0);
  else p.setColor(0, 0, 0);
  p.text(90, y, ev.msg);
}

// ── Footer ──
p.setColor(0, 0, 0);
p.rectFill(0, 280, W, 1);
p.text(12, 296, 'Uptime: 14d 3h 22m');
p.setColor(255, 0, 0);
p.text(280, 296, '2 Alerts');

return p;
