# Render Test Specification

## Overview

Pixel-level rendering tests that load the compiled WASM VM in Bun, execute handcrafted bytecode, and assert framebuffer contents.

## Run

```bash
cd compiler
bun run test:render        # or: bun test render_test/
```

## Directory Structure

```
render_test/
├── lib/
│   ├── wasm-loader.ts     # Loads vm.wasm via Emscripten, exposes reload/run/fireEvent/pixel
│   └── bytecode.ts        # Bytecode builder helpers: pushI32, setColor, rectFill, setWindow, etc.
├── render.test.ts          # Test cases
└── testSpec.md             # This file
```

## lib/wasm-loader API

| Function | Description |
|----------|-------------|
| `loadWasm()` | Load `static/vm.js` + `static/vm.wasm` |
| `reload(w, h, stripH, colorMode, flash?, ...)` | Configure device and load bytecode |
| `run()` | Execute `vm_render`, return RGB888 framebuffer copy |
| `fireEvent(id)` | Fire event, return updated framebuffer or null |
| `pixel(fb, x, y)` | Read `[r, g, b]` at `(x, y)` from framebuffer |
| `destroy()` | Free WASM resources |

## lib/bytecode API

| Function | Description |
|----------|-------------|
| `bc(...parts)` | Flatten nested arrays into `Uint8Array` |
| `pushI32(v)` / `pushF32(v)` | Push immediate value |
| `setColor(r, g, b)` | PUSH r, PUSH g, PUSH b, SET_COLOR |
| `rectFill(x, y, w, h)` | PUSH x, PUSH y, PUSH w, PUSH h, RECT_FILL |
| `setWindow(x, y, w, h, r, g, b)` | CALL_FFI 1 with 7 args |
| `circleFill(cx, cy, r)` | PUSH_F32 cx, PUSH_F32 cy, PUSH_F32 r, CIRCLE_FILL |
| `bindEvent(eventId, pcOffset)` | CALL_FFI 2 with 2 args |
| `callFfi(id, argc, ...args)` | Generic FFI call |

## Test Cases

### basic drawing without setWindow
- White screen by default (no bytecode, just END)
- Red rect at specific position, verify inside/outside pixels
- Rect spanning multiple strips (verifies strip compositing)

### setWindow background fill
- Full-screen setWindow fills entire region
- Partial setWindow fills only specified region, rest stays white

### setWindow + drawing
- Dark bg + colored rect: both bg and drawing visible
- Background preserved across all strip boundaries (y=0..29)
- Drawing column visible on every strip row
- circleFill center pixel correct after setWindow

### Grid pattern (sdk_demo)
- 2×3 grid of differently colored rects on dark bg
- Verifies each rect color at its center, bg at corners

### BW mode
- Black rect on white bg in BW color mode

### BWR mode
- Black rect and red rect on white bg in BWR mode
- Verifies both color passes render correctly without mutual erasure

### Event firing
- Main program draws blue fill, binds sub-function to event 0
- Sub-function uses setWindow for dirty region (green bg + red rect)
- After fireEvent: dirty region updated, area outside dirty region preserved

## Adding New Tests

1. Build bytecode with helpers from `lib/bytecode.ts`
2. Call `reload()` with device dimensions and bytecode
3. Call `run()` to get framebuffer
4. Assert pixel values with `pixel(fb, x, y)`
5. For event tests: call `fireEvent(id)` after `run()`
