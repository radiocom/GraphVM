const p = gvm();

p.setWindow(0, 0, 400, 300, 40, 40, 40);

for (let row = 0; row < 5; row++) {
  for (let col = 0; col < 8; col++) {
    const x = 10 + col * 48;
    const y = 10 + row * 55;
    p.setColor((col * 32) & 0xff, (row * 50) & 0xff, 128);
    p.rectFill(x, y, 40, 45);
  }
}

p.setColor(255, 100, 50);
p.circleFill(200, 150, 40);

p.setColor(255, 255, 0);
p.forLoop('i', 0, 10, (loadI) => {
  loadI();
  p.pushI32(30).mul().pushI32(20).add().storeLocal('x');
  loadI();
  p.pushI32(25).mul().pushI32(15).add().storeLocal('y');
  p.loadLocal('x').loadLocal('y')
    .pushI32(25).pushI32(20)
    .emit({ op: 'rect_fill' });
});

return p;
