const p = gvm();
const W = 400, H = 300, R = 20, STEP = 15;
const PAD = R + 2;

// Main: full-screen white bg, init ball state, draw initial circle
p.setWindow(0, 0, W, H, 255, 255, 255);
p.let('x', 200);
p.let('y', 150);
p.let('dx', 1);
p.let('dy', 1);

p.setColor(0, 0, 0);
p.$('x').i2f().$('y').i2f().pushF32(R).emit({ op: 'circle' });

// Sub-function: bounce on TICK_SEC (event 0)
p.defineFunction('bounce', 0);

  // Save old position, then move
  p.copy('x', 'ox');
  p.copy('y', 'oy');
  p.compute('x', () => { p.$('x').pushI32(STEP).$('dx').mul().add(); });
  p.compute('y', () => { p.$('y').pushI32(STEP).$('dy').mul().add(); });

  // Bounce off edges
  p.ifThen(() => { p.$('x').pushI32(PAD).cmpLe(); },
           () => { p.let('x', PAD); p.let('dx', 1); });
  p.ifThen(() => { p.$('x').pushI32(W - PAD).cmpGe(); },
           () => { p.let('x', W - PAD); p.let('dx', -1); });
  p.ifThen(() => { p.$('y').pushI32(PAD).cmpLe(); },
           () => { p.let('y', PAD); p.let('dy', 1); });
  p.ifThen(() => { p.$('y').pushI32(H - PAD).cmpGe(); },
           () => { p.let('y', H - PAD); p.let('dy', -1); });

  // Dirty region = bbox of old + new position, padded
  p.copy('ox', 'mx');
  p.ifThen(() => { p.$('x').$('ox').cmpLt(); },
           () => { p.copy('x', 'mx'); });
  p.copy('oy', 'my');
  p.ifThen(() => { p.$('y').$('oy').cmpLt(); },
           () => { p.copy('y', 'my'); });

  p.compute('wx', () => { p.$('mx').pushI32(PAD).sub(); });
  p.compute('wy', () => { p.$('my').pushI32(PAD).sub(); });
  // ww = abs(x - ox) + 2*PAD + 1
  p.$('x').$('ox').sub().dup().pushI32(0).cmpLt().jmpIfNot('__ax');
  p.neg().label('__ax');
  p.pushI32(PAD * 2 + 1).add().set('ww');
  // wh = abs(y - oy) + 2*PAD + 1
  p.$('y').$('oy').sub().dup().pushI32(0).cmpLt().jmpIfNot('__ay');
  p.neg().label('__ay');
  p.pushI32(PAD * 2 + 1).add().set('wh');

  // setWindow(wx, wy, ww, wh, bg=white)
  p.$('wx').$('wy').$('ww').$('wh');
  p.pushI32(255).pushI32(255).pushI32(255);
  p.emit({ op: 'call_ffi', id: 1, argc: 7 });

  // Draw circle at (x - wx, y - wy)
  p.setColor(0, 0, 0);
  p.$('x').$('wx').sub().i2f();
  p.$('y').$('wy').sub().i2f();
  p.pushF32(R).emit({ op: 'circle' });

p.endFunction();

return p;
