const p = gvm();
const W = 400, H = 300;

p.setWindow(0, 0, W, H, 255, 255, 255);

// ── Red accent bar on left ──
p.setColor(255, 0, 0);
p.rectFill(0, 0, 8, H);

// ── Name ──
p.setColor(0, 0, 0);
p.text(24, 50, 'John Smith');

// ── Title ──
p.setColor(255, 0, 0);
p.text(24, 80, 'Senior Engineer');

// ── Divider ──
p.setColor(0, 0, 0);
p.rectFill(24, 96, 200, 2);

// ── Contact info ──
p.setColor(0, 0, 0);
p.text(24, 126, 'john@example.com');
p.text(24, 150, '+86 138-0000-1234');
p.text(24, 174, 'github.com/johnsmith');

// ── Company block ──
p.setColor(0, 0, 0);
p.rectFill(24, 200, 352, 2);

p.setColor(255, 0, 0);
p.text(24, 232, 'Acme Technology Co.');

p.setColor(0, 0, 0);
p.text(24, 256, 'Building 12, Tech Park');
p.text(24, 278, 'Shanghai, China 200000');

// ── QR placeholder (decorative box) ──
p.setColor(0, 0, 0);
p.rectFill(300, 100, 80, 80);
p.setColor(255, 255, 255);
p.rectFill(304, 104, 72, 72);
p.setColor(0, 0, 0);
p.rectFill(310, 110, 20, 20);
p.rectFill(350, 110, 20, 20);
p.rectFill(310, 150, 20, 20);
p.rectFill(330, 130, 16, 16);

return p;
