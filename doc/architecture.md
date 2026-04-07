# graphVM Architecture

## Overview

```
┌──────────────────────────────────────────────────────────────────────┐
│                          graphVM System                              │
│                                                                      │
│  ┌──────────────┐   ┌──────────────┐   ┌─────────────────────────┐  │
│  │  PC Simulator │   │  WASM Module │   │  Compiler (Web UI)      │  │
│  │  (Windows)    │   │  (Browser)   │   │  (SvelteKit)            │  │
│  └──────┬───────┘   └──────┬───────┘   └────────┬────────────────┘  │
│         │                  │                     │                   │
│         └──────────┬───────┘                     │                   │
│                    │                             │                   │
│            ┌───────▼───────┐            ┌────────▼───────────────┐   │
│            │   VM Core (C) │◄───────────│  TypeScript Compiler   │   │
│            │   vm.c / vm.h │  bytecode  │  DSL / SDK → IR → BC  │   │
│            └───────────────┘            └────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────┘
```

## Directory Structure

```
graphVm/
├── src/
│   ├── vm/
│   │   ├── vm.h                # VM core: opcodes, vm_t, vm_ffi_fn
│   │   ├── vm.c                # VM interpreter + 2D rendering
│   │   ├── vm_font.h           # Font resource decoder
│   │   ├── vm_font.c           # Font RLE decoder
│   │   └── CMakeLists.txt
│   └── platform/
│       ├── platform.h          # Device context, FFI handlers, lifecycle
│       ├── CMakeLists.txt
│       ├── pc/
│       │   └── platform_pc.c   # Win32 platform (GetTickCount, Sleep)
│       ├── wasm/
│       │   ├── vm_wasm_api.c   # Emscripten WASM exports
│       │   └── platform_wasm.c # WASM platform stubs
│       └── compiler/
│           ├── compiler.c      # Bytecode assembler (text → binary)
│           └── compiler.h
├── simulator/
│   ├── main.c                  # PC simulator (-d WxH, -m MODE, -out)
│   ├── display.h/c             # Win32 GDI window + PNG output
│   ├── gvmb_loader.h/c        # .gvmb bundle parser + file watcher
│   ├── sizeof_report.h/c      # Runtime sizeof diagnostics
│   └── CMakeLists.txt
├── compiler/                   # SvelteKit web application
│   ├── src/lib/compiler/
│   │   ├── opcodes.ts          # Opcode constants (mirrors vm.h)
│   │   ├── ir.ts               # IR type definitions
│   │   ├── ir-compiler.ts      # IR → bytecode compiler
│   │   ├── dsl-compiler.ts     # DSL text → IR compiler
│   │   ├── compiler-wasm.ts    # High-level compile API
│   │   ├── svg-compiler.ts     # SVG → DSL text compiler
│   │   ├── vm-wasm.ts          # WASM VM bindings
│   │   ├── font-compiler.ts    # Font resource compiler (RLE)
│   │   ├── sdk-runner.ts       # SDK code executor
│   │   └── bundle.ts           # Binary bundle (GVMB format)
│   ├── src/lib/sdk/
│   │   └── index.ts            # TypeScript SDK (fluent API)
│   ├── src/routes/
│   │   └── +page.svelte        # Main UI
│   └── static/
│       ├── vm.js               # Emscripten glue (generated)
│       ├── vm.wasm             # Compiled VM (generated)
│       └── examples/           # DSL/SDK example files
├── scripts/
│   └── build_wasm.ps1          # Standalone WASM build script
├── doc/
│   ├── architecture.md         # This file
│   ├── bytecodeSpec.md
│   └── sdkSpec.md
└── CMakeLists.txt              # Top-level: graphvm_sim + graphvm_wasm
```

## Layer Separation

```
┌─────────────────────────────────────┐
│        Application Layer            │
│  simulator/main.c  |  vm_wasm_api.c│
│  (reload, render, fire_event)       │
├─────────────────────────────────────┤
│        Platform Layer               │
│  platform.h (header-only)           │
│  vm_device_ctx_t = ground of truth  │
│  vm_prepare_flash / vm_prepare_screen│
│  vm_boot_checkpoint                 │
│  vm_render / vm_fire_event          │
│  ffi_log / ffi_set_window / ffi_bind_event│
├─────────────────────────────────────┤
│        VM Core (isolated)           │
│  vm.h / vm.c                        │
│  No platform knowledge              │
│  ffi_table = pointer + count        │
│  strip_cb = void(y0, y1, user)      │
└─────────────────────────────────────┘
```

VM core has zero includes from platform. It receives an FFI function pointer
array and a count — nothing more. The platform layer owns all state:
flash storage, screen buffer, FFI table, event bindings.

## Compilation Pipeline

```
  TypeScript SDK                DSL Text              SVG Input
  (programmatic)                (text editor)         (import)
       │                            │                     │
       │                            │                     ▼
       │                            │              ┌──────────────┐
       │                            │              │ svg-compiler │
       │                            │              │ SVG → DSL    │
       │                            │              └──────┬───────┘
       │                            │                     │
       │                            ▼                     ▼
       │                     ┌─────────────┐         DSL Text
       │                     │ dsl-compiler│◄────────────┘
       │                     │ DSL → IR    │
       │                     └──────┬──────┘
       │                            │
       ▼                            ▼
  IR[] (instruction array)     IR[] (instruction array)
       │                            │
       └────────────┬───────────────┘
                    │
                    ▼
             ┌─────────────┐
             │ ir-compiler  │
             │ IR → bytecode│
             │ label resolve│
             │ binary encode│
             └──────┬───────┘
                    │
                    ▼
              Uint8Array (bytecode)
                    │
        ┌───────────┼───────────┐
        ▼           ▼           ▼
  PC Simulator  WASM VM    Hex View
  (native C)   (browser)   (debug)
```

## VM Core

### vm_t (vm.h) — 1720 bytes (x64, no path)

```
vm_t
├── stack[256]          int32_t data stack (float32 via bit-cast)
├── sp                  stack pointer
├── locals[32]          local variable slots
├── code/pc/code_end    bytecode pointers
├── call_stack[16]      return address stack for CALL/RET
├── call_sp             call stack pointer
├── current_color       RGB drawing color
├── line_width          stroke width (float)
├── color_mode          RGB / BW / BWR
├── render_color        current BW/BWR pass color
├── draw_active         whether current color matches render pass
├── canvas_w/h          logical canvas dimensions
├── strip_h/strip_y0    strip rendering window
├── strip_buf           strip buffer (canvas_w × strip_h × bpp)
├── strip_bg            strip background color
├── matrix_stack[16]    2D affine transform stack
├── matrix_sp           matrix stack pointer
├── path_cmds[256]      path command buffer (optional, VM_ENABLE_PATH)
├── ffi_table           vm_ffi_fn pointer (owned by device_ctx)
├── ffi_count           number of registered FFI functions
├── font_res            font resource pointer
├── font_res_len        font resource length
└── running/error       execution state
```

### vm_device_ctx_t (platform.h) — ground of truth

```
vm_device_ctx_t
├── vm                  embedded vm_t
├── flash[8192]         bytecode + resource storage
├── flash_used          bytes used in flash
├── code_offset/len     bytecode region in flash
├── resource_offset/len resource region in flash
├── sctx                screen context (screen buffer, w, h)
├── screen_bg           screen background color
├── win_x/y/w/h        window position and size
├── win_bg              window background color
├── ffi_table[16]       FFI function pointers (vm.ffi_table points here)
└── events[16]          event bindings (pc_offset + bound flag)
```

### Platform API (platform.h)

| Function | Purpose |
|----------|---------|
| `vm_prepare_flash(dev, code, code_len, res, res_len)` | Load bytecode + resource into flash |
| `vm_prepare_screen(dev, w, h, strip_h, color_mode)` | Allocate screen + strip buffers |
| `vm_boot_checkpoint(dev, snapshot)` | Wire FFI table, code pointers, reset stacks |
| `vm_render(dev)` | Clear screen + run bytecode from pc=0 |
| `vm_fire_event(dev, event_id)` | Run bytecode at event's pc_offset |
| `vm_clear_screen(dev, bg)` | Fill screen with color |
| `vm_fill_rect(dev, x, y, w, h, c)` | Fill rectangle on screen |

### Built-in FFI Functions

| ID | Name | Args | Description |
|----|------|------|-------------|
| 0 | `ffi_log` | variadic int32 | Print values to platform log |
| 1 | `ffi_set_window` | x, y, w, h, r, g, b | Set window region + clear with bg |
| 2 | `ffi_bind_event` | event_id, pc_offset | Bind event to bytecode offset |

### Opcode Groups

| Group | Range | Description |
|-------|-------|-------------|
| Stack/Math | 0x00–0x21 | NOP, push, arithmetic, float ops, locals, comparisons, logic |
| Control Flow | 0x30–0x34 | JMP, JMP_IF, JMP_IF_NOT, CALL, RET |
| Drawing | 0x40–0x4A | SET_COLOR, RECT_FILL, LINE, RECT, matrix ops, CIRCLE |
| Path | 0x50–0x56 | PATH_BEGIN/MOVE/LINE/CUBIC/CLOSE/FILL/STROKE |
| Text | 0x60 | TEXT (inline UTF-8 string) |
| FFI | 0x70 | CALL_FFI (host function call) |
| End | 0xFF | Halt execution |

### Strip Rendering

```
for strip_y0 in [0, strip_h, 2*strip_h, ...]:
    clear strip_buf with strip_bg
    reset VM (pc, sp, call_sp, matrix, line_width)
    restore locals from snapshot
    execute all bytecode (drawing ops clip to strip)
    strip_cb(y0, y1, user)  → copy strip to device screen
```

For BW/BWR modes, the entire strip loop runs once per color pass
(black pass, then optional red pass for BWR).

## Platform Targets

### PC Simulator

```
simulator/main.c
├── vm_reload(ctx, path)     parse .gvmb → vm_prepare_flash + vm_prepare_screen
├── vm_render(&dev)          clear screen + run at pc=0
├── vm_fire_event(&dev, id)  tick events (VM_EVENT_TICK_SEC, VM_EVENT_TICK_DAY)
├── display_show_window_ex() Win32 GDI live window with hot-reload
└── display_write_png()      PNG file output (-out flag)

Command line:
  graphvm_sim [options] <file.gvmb>
    -d WxH      device resolution
    -m MODE     color mode: rgb, bw, bwr
    -out FILE   write PNG (no window)
    -s          sizeof report
```

### WASM (Browser)

```
vm_wasm_api.c (5 Emscripten exports)
├── vm_wasm_reload(w, h, strip_h, color_mode, data, code_off, code_len, res_off, res_len)
├── vm_wasm_run()               → vm_render (clear + run at pc=0)
├── vm_wasm_fire_event(id)      → vm_fire_event
├── vm_wasm_get_framebuf()      → pointer to screen RGB888
└── vm_wasm_destroy()           → free buffers

vm-wasm.ts (TypeScript bindings)
├── loadWasm()                  load vm.js + create module
├── reload(w, h, stripH, colorMode, flash?, codeOff, codeLen, resOff, resLen)
├── run()                       render + return ImageData
├── fireEvent(eventId)          fire event + return ImageData
└── destroyVm()                 cleanup
```

## Build Commands

```powershell
# Configure (Visual Studio 2022)
cmake --preset default

# Build PC simulator
cmake --build build --config Debug

# Build WASM module (requires emcc in PATH or C:/Programs/emsdk)
cmake --build build --config Debug --target graphvm_wasm

# Standalone WASM build (alternative)
.\scripts\build_wasm.ps1

# Compiler web app
cd compiler && bun install && bun run dev
```

## Data Flow

```
Integer encoding: little-endian i32 (4 bytes)
Float encoding:   IEEE 754 float32, bit-cast to i32 on stack
Color encoding:   SET_COLOR uses 3× PUSH_I32 (r, g, b)
                  PATH_FILL/STROKE uses packed 0xRRGGBB in single i32
String encoding:  null-terminated UTF-8 (for TEXT opcode)
Event binding:    FFI #2 (ffi_bind_event) maps event_id → pc_offset
```
