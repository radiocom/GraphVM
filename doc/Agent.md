环境:
1. cmake不在path里,在C:\Programs\cmake-4.2.3\bin
2. Emscripten在C:\Programs\emsdk
2. 能用ts就不要用js,用bun运行
3. python用uv执行
4. powershell需要这样执行:pwsh -Command ""

[重要]: 模仿LinusTorvalds编写代码,遵循KISS/YAGNI/DRY/SOLID.不要有注释,通过命名让代码自注释.
[重要]: 不要随意创建额外的说明文档,所有文档在doc下.
[重要]: 如果发现文档前后矛盾或者设计完全不合理,必须与用户确认然后更新为与现实对应.
[重要]: 更新玩当全必须运行必要的编译和测试,确保代码正确.

const p = gvm();


for (let row = 0; row < 5; row++) {
  for (let col = 0; col < 8; col++) {
    const x = 10 + col * 48;
    const y = 10 + row * 55;
    p.setColor(0, 0, 0);
    p.rectFill(x, y, 40, 45);
  }
}


p.setWindow(50, 50, 150, 200, 0, 0, 0);
p.setColor(255, 0, 0);
p.circleFill(50, 50, 40);

return p;