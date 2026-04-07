# graphVM Bytecode Specification

## Overview

graphVM uses a stack-based bytecode format. All multi-byte integers are **little-endian**. The VM executes instructions sequentially, manipulating an operand stack, local variables, and rendering 2D graphics to a strip buffer.

## Data Types

| Type | Size | Description |
|------|------|-------------|
| `u8` | 1 byte | Unsigned 8-bit integer |
| `i32` | 4 bytes | Signed 32-bit integer, little-endian |
| `f32` | 4 bytes | IEEE 754 single-precision float, little-endian |
| `string` | N+1 bytes | UTF-8 encoded, null-terminated |

## VM State

| Component | Size | Description |
|-----------|------|-------------|
| Stack | 256 × i32 | Operand stack (also stores f32 via bit-cast) |
| Locals | 32 × i32 | Local variable slots |
| Call Stack | 16 × u32 | Return address stack for CALL/RET |
| Matrix Stack | 16 × 6×f32 | 2D affine transform stack |
| Path Buffer | 256 commands | Bezier path command buffer (VM_ENABLE_PATH) |
| FFI Table | pointer + count | Foreign function callbacks (owned by device) |
| Font Resource | variable | RLE-compressed glyph data |

## Instruction Set

### Stack & Integer Arithmetic (0x00–0x08)

#### NOP (0x00)
No operation.
```
Encoding: [0x00]
Stack: — → —
```

#### PUSH_I32 (0x01)
Push a 32-bit integer immediate.
```
Encoding: [0x01] [i32:value]
Stack: — → value
Size: 5 bytes
```

#### PUSH_F32 (0x02)
Push a 32-bit float immediate (stored as bit-cast i32 on stack).
```
Encoding: [0x02] [f32:value]
Stack: — → value
Size: 5 bytes
```

#### ADD (0x03)
```
Encoding: [0x03]
Stack: a b → (a+b)
```

#### SUB (0x04)
```
Encoding: [0x04]
Stack: a b → (a-b)
```

#### MUL (0x05)
```
Encoding: [0x05]
Stack: a b → (a*b)
```

#### DIV (0x06)
```
Encoding: [0x06]
Stack: a b → (a/b)
```

#### MOD (0x07)
Integer modulo.
```
Encoding: [0x07]
Stack: a b → (a%b)
```

#### NEG (0x08)
Integer negate.
```
Encoding: [0x08]
Stack: a → (-a)
```

### Float Arithmetic (0x09–0x0F)

#### FADD (0x09)
```
Encoding: [0x09]
Stack: a(f32) b(f32) → (a+b)(f32)
```

#### FSUB (0x0A)
```
Encoding: [0x0A]
Stack: a(f32) b(f32) → (a-b)(f32)
```

#### FMUL (0x0B)
```
Encoding: [0x0B]
Stack: a(f32) b(f32) → (a*b)(f32)
```

#### FDIV (0x0C)
```
Encoding: [0x0C]
Stack: a(f32) b(f32) → (a/b)(f32)
```

#### FNEG (0x0D)
```
Encoding: [0x0D]
Stack: a(f32) → (-a)(f32)
```

#### I2F (0x0E)
Convert integer to float.
```
Encoding: [0x0E]
Stack: a(i32) → (float)a(f32)
```

#### F2I (0x0F)
Convert float to integer (truncate).
```
Encoding: [0x0F]
Stack: a(f32) → (int)a(i32)
```

### Stack Manipulation (0x10–0x12)

#### DUP (0x10)
```
Encoding: [0x10]
Stack: a → a a
```

#### DROP (0x11)
```
Encoding: [0x11]
Stack: a → —
```

#### SWAP (0x12)
```
Encoding: [0x12]
Stack: a b → b a
```

### Local Variables (0x13–0x14)

#### LOAD_LOCAL (0x13)
Load value from local variable slot.
```
Encoding: [0x13] [u8:index]
Stack: — → value
Size: 2 bytes
```

#### STORE_LOCAL (0x14)
Store top of stack into local variable slot.
```
Encoding: [0x14] [u8:index]
Stack: value → —
Size: 2 bytes
```

### Comparison & Logic (0x15–0x21)

#### CMP_EQ (0x15)
```
Encoding: [0x15]
Stack: a b → (a==b ? 1 : 0)
```

#### CMP_NE (0x16)
```
Encoding: [0x16]
Stack: a b → (a!=b ? 1 : 0)
```

#### CMP_LT (0x17)
```
Encoding: [0x17]
Stack: a b → (a<b ? 1 : 0)
```

#### CMP_GT (0x18)
```
Encoding: [0x18]
Stack: a b → (a>b ? 1 : 0)
```

#### CMP_LE (0x19)
```
Encoding: [0x19]
Stack: a b → (a<=b ? 1 : 0)
```

#### CMP_GE (0x1A)
```
Encoding: [0x1A]
Stack: a b → (a>=b ? 1 : 0)
```

#### FCMP_LT (0x1B)
Float less-than comparison.
```
Encoding: [0x1B]
Stack: a(f32) b(f32) → (a<b ? 1 : 0)(i32)
```

#### FCMP_GT (0x1C)
```
Encoding: [0x1C]
Stack: a(f32) b(f32) → (a>b ? 1 : 0)(i32)
```

#### FCMP_LE (0x1D)
```
Encoding: [0x1D]
Stack: a(f32) b(f32) → (a<=b ? 1 : 0)(i32)
```

#### FCMP_GE (0x1E)
```
Encoding: [0x1E]
Stack: a(f32) b(f32) → (a>=b ? 1 : 0)(i32)
```

#### AND (0x1F)
Logical AND (both non-zero → 1).
```
Encoding: [0x1F]
Stack: a b → (a && b ? 1 : 0)
```

#### OR (0x20)
Logical OR (either non-zero → 1).
```
Encoding: [0x20]
Stack: a b → (a || b ? 1 : 0)
```

#### NOT (0x21)
Logical NOT (zero → 1, non-zero → 0).
```
Encoding: [0x21]
Stack: a → (!a ? 1 : 0)
```

### Control Flow (0x30–0x34)

#### JMP (0x30)
Unconditional jump to absolute bytecode offset.
```
Encoding: [0x30] [i32:offset]
Stack: — → —
Size: 5 bytes
```

#### JMP_IF (0x31)
Jump if top of stack is non-zero.
```
Encoding: [0x31] [i32:offset]
Stack: condition → —
Size: 5 bytes
```

#### JMP_IF_NOT (0x32)
Jump if top of stack is zero.
```
Encoding: [0x32] [i32:offset]
Stack: condition → —
Size: 5 bytes
```

#### CALL (0x33)
Push return address onto call stack, jump to target.
```
Encoding: [0x33] [i32:offset]
Stack: — → —
Size: 5 bytes
Call stack: pushes current PC+5
```

#### RET (0x34)
Pop return address from call stack, jump back.
```
Encoding: [0x34]
Stack: — → —
Call stack: pops return address
```

### Drawing Operations (0x40–0x48)

#### SET_COLOR (0x40)
Set current drawing color from RGB values on stack.
```
Encoding: [0x40]
Stack: r g b → —
```

DSL: `SET_COLOR <r> <g> <b>`

#### RECT_FILL (0x41)
Fill a rectangle with current color (integer coordinates).
```
Encoding: [0x41]
Stack: x y w h → —
```

DSL: `RECT_FILL <x> <y> <w> <h>`

#### LINE (0x42)
Draw a line with current color. Coordinates are float, matrix-transformed.
```
Encoding: [0x42]
Stack: x1(f32) y1(f32) x2(f32) y2(f32) → —
```

DSL: `LINE <x1> <y1> <x2> <y2>`

#### RECT (0x43)
Draw a rounded rectangle outline. Float coordinates, matrix-transformed.
```
Encoding: [0x43]
Stack: x(f32) y(f32) w(f32) h(f32) radius(f32) → —
```

DSL: `RECT <x> <y> <w> <h> [radius]`

#### PUSH_MATRIX (0x44)
Save current transform matrix onto the matrix stack.
```
Encoding: [0x44]
Stack: — → —
```

#### POP_MATRIX (0x45)
Restore transform matrix from the matrix stack.
```
Encoding: [0x45]
Stack: — → —
```

#### TRANSLATE (0x46)
Apply translation to current matrix.
```
Encoding: [0x46]
Stack: tx(f32) ty(f32) → —
```

#### ROTATE (0x47)
Apply rotation (degrees) to current matrix.
```
Encoding: [0x47]
Stack: angle(f32) → —
```

#### SCALE (0x48)
Apply scaling to current matrix.
```
Encoding: [0x48]
Stack: sx(f32) sy(f32) → —
```

#### CIRCLE (0x49)
Draw a circle outline at (cx, cy) with radius r using current color. Center is matrix-transformed.
```
Encoding: [0x49]
Stack: cx(f32) cy(f32) r(f32) → —
```

DSL: `CIRCLE <cx> <cy> <r>`

#### CIRCLE_FILL (0x4A)
Fill a circle at (cx, cy) with radius r using current color. Center is matrix-transformed.
```
Encoding: [0x4A]
Stack: cx(f32) cy(f32) r(f32) → —
```

DSL: `CIRCLE_FILL <cx> <cy> <r>`

### Path Operations (0x50–0x56, requires VM_ENABLE_PATH)

#### PATH_BEGIN (0x50)
Clear the path buffer and start a new path.
```
Encoding: [0x50]
Stack: — → —
```

#### PATH_MOVE (0x51)
Move the pen to a new position without drawing.
```
Encoding: [0x51]
Stack: x(f32) y(f32) → —
```

#### PATH_LINE (0x52)
Add a line segment from current position to target.
```
Encoding: [0x52]
Stack: x(f32) y(f32) → —
```

#### PATH_CUBIC (0x53)
Add a cubic Bézier curve segment.
```
Encoding: [0x53]
Stack: cx1(f32) cy1(f32) cx2(f32) cy2(f32) x(f32) y(f32) → —
```

#### PATH_CLOSE (0x54)
Close the current path by drawing a line back to the start point.
```
Encoding: [0x54]
Stack: — → —
```

#### PATH_FILL (0x55)
Fill the current path with given color using winding number rule.
```
Encoding: [0x55]
Stack: color(i32) → —
```

Color format: `0xRRGGBB` packed integer.

DSL: `PATH_FILL <color>`

#### PATH_STROKE (0x56)
Stroke the current path with given color and width.
```
Encoding: [0x56]
Stack: color(i32) width(f32) → —
```

DSL: `PATH_STROKE <color> <width>`

### Text (0x60)

#### TEXT (0x60)
Render text at position (x, y) using the loaded font resource. The string is encoded inline after the opcode as null-terminated UTF-8.
```
Encoding: [0x60] [string:content]
Stack: x(f32) y(f32) → —
```

DSL: `TEXT <x> <y> "<content>"`

Bytecode example for `TEXT 10.0 20.0 "Hi"`:
```
[0x02][f32:10.0]   ; PUSH_F32 10.0
[0x02][f32:20.0]   ; PUSH_F32 20.0
[0x60]              ; TEXT
[0x48 0x69 0x00]    ; "Hi\0"
```

### FFI (0x70)

#### CALL_FFI (0x70)
Call a registered foreign function.
```
Encoding: [0x70] [u8:ffi_id] [u8:argc]
Stack: arg1 arg2 ... argN → —
```

DSL: `CALL_FFI <id> <argc> [args...]`

### End (0xFF)

#### END (0xFF)
Halt VM execution.
```
Encoding: [0xFF]
Stack: — → —
```

## Opcode Summary Table

| Opcode | Hex | Stack In | Stack Out | Inline Data |
|--------|-----|----------|-----------|-------------|
| NOP | 0x00 | — | — | — |
| PUSH_I32 | 0x01 | — | i32 | i32 |
| PUSH_F32 | 0x02 | — | f32 | f32 |
| ADD | 0x03 | i32 i32 | i32 | — |
| SUB | 0x04 | i32 i32 | i32 | — |
| MUL | 0x05 | i32 i32 | i32 | — |
| DIV | 0x06 | i32 i32 | i32 | — |
| MOD | 0x07 | i32 i32 | i32 | — |
| NEG | 0x08 | i32 | i32 | — |
| FADD | 0x09 | f32 f32 | f32 | — |
| FSUB | 0x0A | f32 f32 | f32 | — |
| FMUL | 0x0B | f32 f32 | f32 | — |
| FDIV | 0x0C | f32 f32 | f32 | — |
| FNEG | 0x0D | f32 | f32 | — |
| I2F | 0x0E | i32 | f32 | — |
| F2I | 0x0F | f32 | i32 | — |
| DUP | 0x10 | val | val val | — |
| DROP | 0x11 | val | — | — |
| SWAP | 0x12 | a b | b a | — |
| LOAD_LOCAL | 0x13 | — | val | u8 |
| STORE_LOCAL | 0x14 | val | — | u8 |
| CMP_EQ | 0x15 | i32 i32 | i32 | — |
| CMP_NE | 0x16 | i32 i32 | i32 | — |
| CMP_LT | 0x17 | i32 i32 | i32 | — |
| CMP_GT | 0x18 | i32 i32 | i32 | — |
| CMP_LE | 0x19 | i32 i32 | i32 | — |
| CMP_GE | 0x1A | i32 i32 | i32 | — |
| FCMP_LT | 0x1B | f32 f32 | i32 | — |
| FCMP_GT | 0x1C | f32 f32 | i32 | — |
| FCMP_LE | 0x1D | f32 f32 | i32 | — |
| FCMP_GE | 0x1E | f32 f32 | i32 | — |
| AND | 0x1F | i32 i32 | i32 | — |
| OR | 0x20 | i32 i32 | i32 | — |
| NOT | 0x21 | i32 | i32 | — |
| JMP | 0x30 | — | — | i32 |
| JMP_IF | 0x31 | cond | — | i32 |
| JMP_IF_NOT | 0x32 | cond | — | i32 |
| CALL | 0x33 | — | — | i32 |
| RET | 0x34 | — | — | — |
| SET_COLOR | 0x40 | r g b | — | — |
| RECT_FILL | 0x41 | x y w h | — | — |
| LINE | 0x42 | x1 y1 x2 y2 | — | — |
| RECT | 0x43 | x y w h r | — | — |
| PUSH_MATRIX | 0x44 | — | — | — |
| POP_MATRIX | 0x45 | — | — | — |
| TRANSLATE | 0x46 | tx ty | — | — |
| ROTATE | 0x47 | angle | — | — |
| SCALE | 0x48 | sx sy | — | — |
| CIRCLE | 0x49 | cx cy r | — | — |
| CIRCLE_FILL | 0x4A | cx cy r | — | — |
| PATH_BEGIN | 0x50 | — | — | — |
| PATH_MOVE | 0x51 | x y | — | — |
| PATH_LINE | 0x52 | x y | — | — |
| PATH_CUBIC | 0x53 | cx1 cy1 cx2 cy2 x y | — | — |
| PATH_CLOSE | 0x54 | — | — | — |
| PATH_FILL | 0x55 | color | — | — |
| PATH_STROKE | 0x56 | color width | — | — |
| TEXT | 0x60 | x y | — | string |
| CALL_FFI | 0x70 | args... | — | u8 u8 |
| END | 0xFF | — | — | — |

## Font Resource Format

Font resources are packed into flash after the bytecode. `vm_prepare_flash()` stores both code and resource contiguously. Only characters actually used in TEXT instructions are compiled into the resource.

### Binary Layout

```
┌─────────────────────────────────┐
│ Header (7 bytes)                │
├─────────────────────────────────┤
│ Glyph Table (N × 13 bytes)     │
├─────────────────────────────────┤
│ RLE Bitmap Data (variable)      │
└─────────────────────────────────┘
```

### Header (7 bytes, packed)

| Offset | Size | Field | Description |
|--------|------|-------|-------------|
| 0 | 2 | magic | `'G'` `'F'` (0x47 0x46) |
| 2 | 1 | font_size | Font height in pixels |
| 3 | 2 | glyph_count | Number of glyphs (u16 LE) |
| 5 | 2 | data_size | Total RLE data size in bytes (u16 LE) |

### Glyph Entry (13 bytes each, packed)

| Offset | Size | Field | Description |
|--------|------|-------|-------------|
| 0 | 4 | codepoint | Unicode codepoint (u32 LE) |
| 4 | 1 | width | Glyph bitmap width |
| 5 | 1 | height | Glyph bitmap height |
| 6 | 1 | advance_x | Horizontal advance |
| 7 | 1 | bearing_x | Horizontal bearing (signed) |
| 8 | 1 | bearing_y | Vertical bearing (signed) |
| 9 | 2 | data_offset | Offset into RLE data section (u16 LE) |
| 11 | 2 | data_length | Length of RLE data for this glyph (u16 LE) |

### RLE Bitmap Encoding

Each glyph's bitmap is encoded as a sequence of `[count, value]` byte pairs:

```
[run_length_1, pixel_value_1, run_length_2, pixel_value_2, ...]
```

- `run_length`: u8, number of consecutive pixels (1–255)
- `pixel_value`: u8, grayscale intensity (0=transparent, 255=opaque)
- Pixels are stored row-major, left-to-right, top-to-bottom
- Total decoded pixels = width × height

## DSL Syntax

```
; Comment (semicolon to end of line)
OPCODE arg1 arg2 ...
TEXT x y "string content"
END
```

- Integer arguments: `123`, `-5`
- Float arguments: `10.0`, `3.14`, `1e-3`
- Color arguments: `#FF0000`, `#F00`, `red`, `blue`
- String arguments: `"quoted text"`

### DSL Commands

All VM opcodes are available as DSL commands. Additionally, the DSL supports these aliases for backward compatibility:

| DSL Command | Maps To |
|-------------|---------|
| `PUSH_IMM` / `PUSH` | `PUSH_I32` |
| `PATH_END_FILL` | `PATH_FILL` |
| `PATH_END_STROKE` | `PATH_STROKE` |
