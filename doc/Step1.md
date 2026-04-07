需要你遵循doc/Agent.md来完成任务
这个步骤之前是一个Idea: doc/Step0_idea.md, 

如果用户明确指定了你在Step1,那你需要按要求搭建环境:
要求:
1.创建CMake主体环境.
2.包含pc的模拟器的编译环境.
3.包含基于Svelte+WebAssembly的Compiler,用于构建bytecode和预览状态.


执行结果:
graphVm/
├── CMakeLists.txt
├── CMakePresets.json
├── .gitignore
├── include/
│   ├── vm/vm.h, vm_font.h, compiler.h
│   ├── platform/platform.h
│   └── util/minpng.h
├── src/
│   ├── vm/
│   │   ├── CMakeLists.txt
│   │   ├── vm.c, vm_font.c
│   │   └── vm_wasm_api.c
│   ├── compiler/
│   │   ├── CMakeLists.txt
│   │   └── compiler.c
│   └── platform/
│       ├── CMakeLists.txt
│       ├── platform_pc.c
│       └── platform_wasm.c
├── simulator/
│   ├── CMakeLists.txt
│   ├── main.c
│   ├── display.h
│   ├── display.c
│   ├── gvmb_loader.h
│   ├── gvmb_loader.c
│   ├── sizeof_report.h
│   └── sizeof_report.c
├── compiler/
│   ├── package.json
│   ├── svelte.config.js
│   ├── vite.config.ts
│   ├── tsconfig.json
│   ├── static/
│   │   ├── vm.js              (Emscripten生成)
│   │   ├── vm.wasm            (C VM编译为WASM)
│   │   └── examples/          (DSL示例文件)
│   └── src/
│       ├── lib/
│       │   ├── types.ts                    (共享类型定义)
│       │   ├── stores/compiler-store.ts    (Svelte store)
│       │   ├── compiler/
│       │   │   ├── compiler-wasm.ts        (编译+hex转换+文本字符提取)
│       │   │   ├── font-compiler.ts        (字体资源编译,RLE编码)
│       │   │   ├── vm-wasm.ts              (WASM绑定)
│       │   │   ├── svg-compiler.ts         (SVG→DSL编译器,库保留)
│       │   │   └── bundle.ts               (二进制打包: GVMB格式)
│       │   └── components/
│       │       ├── DslEditor.svelte        (DSL编辑器+示例选择)
│       │       ├── PreviewPanel.svelte     (画布预览+运行时配置+hex查看)
│       │       └── ResourcePanel.svelte    (资源管理+额外字符+分组)
│       └── routes/+page.svelte             (主页面,组件编排)
├── scripts/
│   └── build_wasm.ps1
└── doc/
    ├── Step0_idea.md
    ├── step1.md
    ├── architecture.md
    ├── bytecodeSpec.md
    ├── mcu_resource_assessment.md
    └── Agent.md


## Compiler UI 架构

### 顶栏 (Top Bar)
- GraphVM Compiler 标题 + WASM状态指示
- Resolution 选择 (全局画布分辨率)
- Font 设置 (字号+字体族, 全局风格级别)
- ▶ Render 按钮 (编译+渲染)
- ⬇ Download 按钮 (下载GVMB二进制包)

### 左侧面板 (Tab切换)
1. **DSL Editor** - DSL文本编辑器, 支持从示例列表加载
2. **Resources** - 资源管理面板:
   - Extra Characters: 输入运行时可能出现但DSL中未列出的字符
   - Font chars 显示: DSL中提取的字符 + 额外字符的合集
   - Generated Resources: 按group分组展示, 可展开查看hex和复制

### 右侧面板 (Preview)
- 画布预览 (Fit/1x缩放)
- Runtime Config: 刷新间隔 + Timer管理 (添加/删除/启用/触发)
- ByteCode hex (左半) + Resource hex (右半), 支持点击复制

## Resource 管理工作流

### 字体裁剪
MCU设备内存有限, 不需要下载完整字体. 系统自动从DSL的TEXT指令中提取使用的字符,
加上用户在Resource页面手动添加的"额外字符"(运行时动态生成的内容, 如时间/温度等),
仅编译这些字符的字形数据(RLE压缩), 生成精简的字体资源.

### 额外字符 (Extra Characters)
运行时VM可能通过计算生成DSL中未直接出现的字符(如实时时钟的数字、传感器读数等).
在Resource页面的"Extra Characters"文本框中输入这些字符, 它们会被合并到字体资源中.

### 二进制打包 (GVMB Bundle)
点击Download时, 系统将以下内容打包为GVMB格式二进制文件:
- **Bytecode** (Section 0x01): 编译后的VM字节码
- **Resources** (Section 0x02): 字体等资源数据, 带group:name标识
- **Config** (Section 0x03): 运行时配置(刷新间隔、Timer设置)

GVMB格式:
```
[4B Magic: 0x47564D42 "GVMB"]
[4B Version: 1]
[1B SectionType][4B SectionLen][...SectionData] × N
```

Section Types:
- `0x01` Bytecode: raw VM bytecode
- `0x02` Resource: `[1B nameLen][nameLen bytes name][data...]`
- `0x03` Config: `[2B refreshIntervalMs LE][1B timerCount][1B pad][timerCount × {1B id, 1B pad, 2B intervalMs LE}]`
- `0x04` Canvas: `[4B canvasW LE][4B canvasH LE]`
