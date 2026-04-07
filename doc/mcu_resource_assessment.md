# GraphVM MCU Resource Assessment

Based on actual measurement (x64 sizeof_report) and manual 32-bit ARM Cortex-M projection.

## 1. vm_t RAM (Static)

Measured on x64: **1,928 bytes** (path disabled), **9,112 bytes** (path enabled).

On 32-bit ARM (pointers 4B), path disabled (default):

| Field | Size (ARM32) | Notes |
|---|---|---|
| stack[256] | 1,024 | int32_t × 256 |
| sp | 4 | |
| locals[32] | 128 | int32_t × 32 |
| code, pc, code_end | 12 | 3 × pointer (4B each) |
| call_stack[16] | 64 | uint32_t × 16 |
| call_sp | 4 | |
| current_color | 3 | rgb |
| line_width | 4 | float |
| canvas_w/h, strip_h, strip_y0 | 16 | 4 × int32_t |
| strip_buf | 4 | pointer |
| matrix_stack[16] | 384 | vm_matrix_t(24B) × 16 |
| matrix_sp | 4 | |
| timers[8] | 96 | vm_timer_t(12B) × 8 |
| refresh_interval_ms | 4 | |
| last_refresh_ms | 4 | |
| refresh_requested | 1 | bool |
| ffi_table[16] | 64 | function pointer(4B) × 16 |
| font_res | 4 | pointer |
| font_res_len | 4 | |
| running, error | 2 | 2 × bool |
| **Total** | **~1,832** | padding may add ~20B → **~1,852 bytes** |

With `VM_ENABLE_PATH` defined, adds:

| Field | Size (ARM32) | Notes |
|---|---|---|
| path_cmds[256] | 7,168 | vm_path_cmd_t(28B) × 256 |
| path_count | 4 | |
| path_start_x/y | 8 | 2 × float |
| **Path total** | **7,180** | |

## 2. Strip Buffer RAM (Dynamic)

`canvas_w × strip_h × 3` bytes (RGB888).

| Canvas | strip_h | Buffer |
|---|---|---|
| 128×64 | 1 | 384 B |
| 128×64 | 4 | 1,536 B |
| 160×120 | 4 | 1,920 B |
| 240×240 | 4 | 2,880 B |
| 320×240 | 4 | 3,840 B |

## 3. Stack Usage (C call stack, not VM stack)

`path_fill()` uses iterator-based edge traversal (no large stack allocation):
- Small callback context structs (~20 bytes each)
- **Peak: ~100 bytes** during path fill

`exec_text()` allocates:
- `uint8_t row_pixels[256]` = 256 bytes
- `char text_buf[128]` = 128 bytes

Estimated C stack requirement: **~1 KB** (with nesting headroom)

## 4. Flash (Code Size)

MSVC x64 Release: vm_core.lib = 49 KB (includes metadata/debug).

ARM Cortex-M Thumb-2 estimate (based on typical MSVC→ARM ratio ~0.3–0.5×):

| Module | Estimated ARM .text |
|---|---|
| vm.c (interpreter + rendering) | ~6–10 KB |
| vm_font.c (glyph lookup + RLE decode) | ~0.5–1 KB |
| platform shim | ~0.2 KB |
| libm (cosf, sinf, fabsf, sqrtf) | ~1–2 KB (if not already linked) |
| **Total** | **~8–13 KB** |

## 5. Summary by MCU Class

Path disabled (default):

| Resource | Default | STM32F103 (64KB Flash, 20KB RAM) | STM32F411 (512KB Flash, 128KB RAM) | ESP32-S3 (8MB Flash, 512KB RAM) |
|---|---|---|---|---|
| Flash (.text) | ~8 KB | ✅ | ✅ | ✅ |
| vm_t static RAM | ~1.9 KB | ✅ 10% of RAM | ✅ 1.5% | ✅ <1% |
| Strip buffer (160×4) | ~1.9 KB | ✅ 20% total | ✅ | ✅ |
| C stack peak | ~0.5 KB | ✅ | ✅ | ✅ |
| **Verdict** | | **✅ Comfortable** | **✅ Trivial** | **✅ Trivial** |

With `VM_ENABLE_PATH` (adds ~7.2 KB):

| Resource | With path | STM32F103 | STM32F411 | ESP32-S3 |
|---|---|---|---|---|
| vm_t static RAM | ~9.1 KB | ⚠️ 45% of RAM | ✅ 7% | ✅ 2% |
| C stack peak | ~1 KB | ✅ | ✅ | ✅ |

## 6. Optimization Opportunities

### Implemented: VM_ENABLE_PATH compile switch

Path support (SVG bezier curves, fill, stroke) is gated behind `VM_ENABLE_PATH`.
Default: **disabled**. Saves **7,184 bytes** of vm_t RAM (79% reduction).

Enable with `-DVM_ENABLE_PATH` at compile time for SVG icon rendering.

### Implemented: Compile-time Tunable Constants

All VM constants are `#ifndef`-guarded, configurable via `-D` at compile time.

### Implemented: path_fill() Stack Reduction

When path is enabled, `path_fill()` uses iterator-based edge traversal instead of
`float pts[VM_PATH_MAX_PTS * 2]` stack allocation. C stack peak reduced from ~2.2 KB to ~100 bytes.

### Further Tuning

| Change | Savings |
|---|---|
| VM_STACK_SIZE 256→64 | 768 B |
| VM_MATRIX_STACK 16→4 | 288 B |
| VM_LOCAL_MAX 32→16 | 64 B |
| VM_FFI_MAX 16→8 | 32 B (ARM32) |
| strip_h=1 (128×64 canvas) | saves 1,152 B vs strip_h=4 |

### Low-RAM Profile Example (path disabled)

```
VM_STACK_SIZE=64      → 256 B (was 1,024)
VM_MATRIX_STACK=4     → 96 B  (was 384)
VM_LOCAL_MAX=16       → 64 B  (was 128)
strip_h=1, 128×64     → 384 B
```
**Total: ~0.7 KB vm_t + 384 B strip ≈ 1.1 KB RAM** — easily fits STM32F103.

## 7. Conclusion

The VM is MCU-friendly by design (strip rendering, no heap during execution, stack-based interpreter).
With `VM_ENABLE_PATH` disabled (default), vm_t is only **~1.9 KB** — fits comfortably on any MCU.
With path enabled and all constants at default, vm_t is ~9.1 KB, suitable for Cortex-M4+.
Flash footprint is ~8–10 KB, well within any modern MCU.
