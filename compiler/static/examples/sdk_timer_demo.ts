const p = gvm();
const W = 400, H = 300;

// Main: full-screen window with dark background
p.setWindow(0, 0, W, H, 25, 25, 40);

p.setColor(60, 40, 140);
p.rectFill(0, 0, W, 50);
p.setColor(255, 255, 255);
p.text(120, 35, 'Timer Demo');

p.setColor(40, 40, 60);
p.rectFill(100, 100, 200, 80);

p.setColor(180, 180, 200);
p.text(140, 130, 'Counter:');

p.setColor(0, 255, 180);
p.text(220, 130, '0');

p.setColor(80, 60, 180);
p.rectFill(100, 100, 200, 2);
p.rectFill(100, 178, 200, 2);
p.rectFill(100, 100, 2, 80);
p.rectFill(298, 100, 2, 80);

p.setColor(30, 30, 50);
p.rectFill(110, 145, 180, 25);

p.setColor(40, 40, 55);
p.rectFill(0, 270, W, 30);
p.setColor(100, 100, 120);
p.text(10, 290, 'Event 0: tick_sec updates counter');

p.pushI32(0).storeLocal('counter');

// Sub-function: update counter region on TICK_SEC
p.defineFunction('update_counter', 0);

// Dirty region: the counter box area (canvas-relative coords after setWindow)
p.setWindow(100, 100, 200, 80, 40, 40, 60);

p.setColor(180, 180, 200);
p.text(40, 30, 'Counter:');

p.loadLocal('counter').pushI32(1).add().storeLocal('counter');

p.loadLocal('counter').pushI32(10).mod().storeLocal('digit');
p.setColor(0, 255, 180);

p.ifThen(() => { p.loadLocal('digit').pushI32(0).cmpEq(); }, () => { p.text(120, 30, '0'); });
p.ifThen(() => { p.loadLocal('digit').pushI32(1).cmpEq(); }, () => { p.text(120, 30, '1'); });
p.ifThen(() => { p.loadLocal('digit').pushI32(2).cmpEq(); }, () => { p.text(120, 30, '2'); });
p.ifThen(() => { p.loadLocal('digit').pushI32(3).cmpEq(); }, () => { p.text(120, 30, '3'); });
p.ifThen(() => { p.loadLocal('digit').pushI32(4).cmpEq(); }, () => { p.text(120, 30, '4'); });
p.ifThen(() => { p.loadLocal('digit').pushI32(5).cmpEq(); }, () => { p.text(120, 30, '5'); });
p.ifThen(() => { p.loadLocal('digit').pushI32(6).cmpEq(); }, () => { p.text(120, 30, '6'); });
p.ifThen(() => { p.loadLocal('digit').pushI32(7).cmpEq(); }, () => { p.text(120, 30, '7'); });
p.ifThen(() => { p.loadLocal('digit').pushI32(8).cmpEq(); }, () => { p.text(120, 30, '8'); });
p.ifThen(() => { p.loadLocal('digit').pushI32(9).cmpEq(); }, () => { p.text(120, 30, '9'); });

p.setColor(30, 30, 50);
p.rectFill(10, 45, 180, 25);
p.setColor(0, 200, 150);
p.loadLocal('counter').pushI32(20).mod().pushI32(9).mul().storeLocal('bar_w');
p.pushI32(10).pushI32(45).loadLocal('bar_w').pushI32(25).emit({ op: 'rect_fill' });

p.setColor(80, 60, 180);
p.rectFill(0, 0, 200, 2);
p.rectFill(0, 78, 200, 2);
p.rectFill(0, 0, 2, 80);
p.rectFill(198, 0, 2, 80);

p.endFunction();

return p;
