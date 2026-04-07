# GraphVM SDK Specification

## Overview

SDK programs are TypeScript snippets evaluated at runtime. They use the `GvmProgram` fluent API to generate IR instructions, which are compiled to bytecode.

```typescript
const p = gvm();
// ... build program ...
return p;
```

## Program Structure

```
Main Program          → runs once on load, draws initial screen
  ├── setWindow()     → set rendering window + background color
  ├── drawing ops     → setColor, rectFill, text, circle, ...
  ├── register_event  → bind subfunctions to platform events (auto via defineFunction)
  └── END

Sub-function 1        → runs on event trigger, partial screen update
  ├── setWindow()     → set dirty region + background color
  ├── drawing ops
  └── END

Sub-function 2 ...
```

## Platform FFI

| ID | Name | Args | Description |
|----|------|------|-------------|
| 0 | `ffi_log` | variadic int32 | Debug logging to platform console |
| 1 | `ffi_set_window` | x, y, w, h, bg_r, bg_g, bg_b | Set window region, fill with bg color |
| 2 | `ffi_bind_event` | event_id, pc_offset | Bind a bytecode offset to a platform event |

All three are registered automatically by `vm_boot_checkpoint()`.

## Platform Events

| Event ID | Name | Trigger |
|----------|------|---------|
| 0 | `TICK_SEC` | Every 1 second |
| 1 | `TICK_DAY` | Every 24 hours |

## API Reference

### Initialization

```typescript
const p = gvm();    // create program
return p;           // must return the program
```

### Stack Operations

| Method | Stack Effect | Description |
|--------|-------------|-------------|
| `pushI32(n)` | → n | Push 32-bit integer |
| `pushF32(n)` | → n | Push 32-bit float |
| `dup()` | a → a a | Duplicate top |
| `drop()` | a → | Remove top |
| `swap()` | a b → b a | Swap top two |

### Arithmetic (integer)

| Method | Stack Effect |
|--------|-------------|
| `add()` | a b → a+b |
| `sub()` | a b → a-b |
| `mul()` | a b → a*b |
| `div()` | a b → a/b |
| `mod()` | a b → a%b |
| `neg()` | a → -a |

### Arithmetic (float)

| Method | Stack Effect |
|--------|-------------|
| `fadd()` | a b → a+b |
| `fsub()` | a b → a-b |
| `fmul()` | a b → a*b |
| `fdiv()` | a b → a/b |
| `fneg()` | a → -a |

### Type Conversion

| Method | Stack Effect |
|--------|-------------|
| `i2f()` | int → float |
| `f2i()` | float → int |

### Comparison

| Method | Stack Effect | Condition |
|--------|-------------|-----------|
| `cmpEq()` | a b → (a==b) | Equal |
| `cmpNe()` | a b → (a!=b) | Not equal |
| `cmpLt()` | a b → (a<b) | Less than |
| `cmpGt()` | a b → (a>b) | Greater than |
| `cmpLe()` | a b → (a<=b) | Less or equal |
| `cmpGe()` | a b → (a>=b) | Greater or equal |
| `fcmpLt/Gt/Le/Ge()` | Same for float |

### Logic

| Method | Stack Effect |
|--------|-------------|
| `and()` | a b → a&&b |
| `or()` | a b → a\|\|b |
| `not()` | a → !a |

### Local Variables

```typescript
p.pushI32(42).storeLocal('x');   // x = 42
p.loadLocal('x');                 // push x onto stack
```

Named locals are auto-allocated. Locals are saved/restored across strip passes within a single render.

### Drawing

```typescript
p.setColor(r, g, b);                    // set current color (0-255)
p.rectFill(x, y, w, h);                 // filled rectangle (integer coords)
p.rect(x, y, w, h, radius?);            // rectangle (float coords, optional corner radius)
p.line(x0, y0, x1, y1);                 // line (float coords)
p.circle(cx, cy, r);                    // hollow circle (float coords)
p.circleFill(cx, cy, r);                // filled circle (float coords)
p.text(x, y, "content");                // text at position (float coords)
```

### Matrix Transform

```typescript
p.pushMatrix();
p.translate(x, y);
p.rotate(degrees);
p.scale(sx, sy);
p.popMatrix();

// Helper:
p.withMatrix(() => {
    p.translate(100, 50);
    p.rotate(45);
    // draw rotated content
});
```

### Path Drawing

```typescript
p.pathBegin();
p.pathMove(x, y);
p.pathLine(x, y);
p.pathCubic(cx1, cy1, cx2, cy2, x, y);
p.pathClose();
p.pathFill(rgb(r, g, b));               // fill with packed color
p.pathStroke(rgb(r, g, b), width);       // stroke with packed color + width
```

### Window Management

```typescript
// Set rendering window: position, size, background color
p.setWindow(x, y, w, h, bgR, bgG, bgB);
```

`ffi_set_window` fills the window region with the background color. Pixels drawn by the program overwrite the background. Pixels outside the window are not affected.

For the main program, use full screen:
```typescript
p.setWindow(0, 0, 400, 300, 255, 255, 255);  // white background
```

For subfunctions, use the dirty region:
```typescript
p.setWindow(wx, wy, ww, wh, 255, 255, 255);  // only update this area
```

### Control Flow

```typescript
// If-then
p.ifThen(
    () => { p.loadLocal('x').pushI32(10).cmpGt(); },  // condition
    () => { /* then block */ }
);

// If-then-else
p.ifThen(
    () => { p.loadLocal('x').pushI32(10).cmpGt(); },
    () => { /* then */ },
    () => { /* else */ }
);

// For loop
p.forLoop('i', 0, 10, (loadI) => {
    loadI();  // push loop variable
    // loop body
});
```

### Sub-functions and Events

```typescript
// Define a sub-function bound to event 0 (TICK_SEC)
p.defineFunction('update', 0);

// Set dirty region with background color
p.setWindow(x, y, w, h, 255, 255, 255);

// Draw updated content
p.setColor(0, 0, 0);
p.circle(newX, newY, 20);

p.endFunction();
```

`defineFunction(name, eventId)` does three things:
1. Emits `register_event(eventId, label)` in the main program — tells the platform to call this subfunc when the event fires
2. Emits `END` to terminate the main program
3. Places the subfunc code after the END

### FFI Calls

```typescript
p.callFfi(id, arg1, arg2, ...);  // call platform function by ID
```

### Helpers

```typescript
rgb(r, g, b)  // pack RGB into 0xRRGGBB integer (for pathFill/pathStroke)
```

## Color Modes

| Mode | Colors | Screen BG | Use Case |
|------|--------|-----------|----------|
| `rgb` | Full 24-bit | White (255,255,255) | LCD displays |
| `bw` | Black + White | White (255,255,255) | BW e-ink |
| `bwr` | Black + White + Red | White (255,255,255) | BWR e-ink |

Color mode is set at reload time (application layer), not by bytecode.

For BW/BWR modes, use only black (0,0,0), white (255,255,255), and red (255,0,0). Other colors are mapped to the nearest match by the rendering engine.

## Example: BWR Clock with Partial Update

```typescript
const p = gvm();
const W = 400, H = 300;

// Main: draw static background
p.setWindow(0, 0, W, H, 255, 255, 255);
p.setColor(0, 0, 0);
p.rectFill(0, 0, W, 3);
p.rectFill(0, 297, W, 3);
p.setColor(255, 0, 0);
p.text(150, 150, 'My Clock');

// Initialize state
p.pushI32(0).storeLocal('seconds');

// Sub-function: update seconds display every second
p.defineFunction('tick', 0);  // event 0 = TICK_SEC

// Only update the seconds region
p.setWindow(100, 200, 200, 40, 255, 255, 255);

p.loadLocal('seconds').pushI32(1).add().storeLocal('seconds');
p.setColor(0, 0, 0);
// ... draw seconds value ...

p.endFunction();

return p;
```
