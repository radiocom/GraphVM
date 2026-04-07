#include "sizeof_report.h"
#include "vm/vm.h"
#include "vm/vm_font.h"
#include "platform/platform.h"
#include <stddef.h>

#define VM_FIELD(field) \
    platform_log("  %-20s offset=%-5d size=%-5d\n", \
                 #field, (int)offsetof(vm_t, field), (int)sizeof(((vm_t *)0)->field))

void print_sizeof_report(void) {
    platform_log("=== GraphVM sizeof Report ===\n\n");
    platform_log("sizeof(vm_t) = %d bytes\n\n", (int)sizeof(vm_t));

    platform_log("vm_t field breakdown:\n");
    VM_FIELD(stack);
    VM_FIELD(sp);
    VM_FIELD(locals);
    VM_FIELD(code);
    VM_FIELD(pc);
    VM_FIELD(code_end);
    VM_FIELD(call_stack);
    VM_FIELD(call_sp);
    VM_FIELD(current_color);
    VM_FIELD(line_width);
    VM_FIELD(canvas_w);
    VM_FIELD(canvas_h);
    VM_FIELD(strip_h);
    VM_FIELD(strip_y0);
    VM_FIELD(strip_buf);
    VM_FIELD(matrix_stack);
    VM_FIELD(matrix_sp);
#ifdef VM_ENABLE_PATH
    VM_FIELD(path_cmds);
    VM_FIELD(path_count);
    VM_FIELD(path_start_x);
    VM_FIELD(path_start_y);
#endif
    VM_FIELD(ffi_table);
    VM_FIELD(ffi_count);
    VM_FIELD(font_res);
    VM_FIELD(font_res_len);
    VM_FIELD(running);
    VM_FIELD(error);

    platform_log("\nHelper struct sizes:\n");
    platform_log("  vm_color_t       = %d bytes\n", (int)sizeof(vm_color_t));
    platform_log("  vm_matrix_t      = %d bytes\n", (int)sizeof(vm_matrix_t));
#ifdef VM_ENABLE_PATH
    platform_log("  vm_path_cmd_t    = %d bytes\n", (int)sizeof(vm_path_cmd_t));
#endif
    platform_log("  vm_font_header_t = %d bytes\n", (int)sizeof(vm_font_header_t));
    platform_log("  vm_glyph_entry_t = %d bytes\n", (int)sizeof(vm_glyph_entry_t));

    platform_log("\nConfig constants:\n");
    platform_log("  VM_STACK_SIZE    = %d  (%d bytes)\n",
                 VM_STACK_SIZE, (int)(VM_STACK_SIZE * sizeof(int32_t)));
    platform_log("  VM_LOCAL_MAX     = %d  (%d bytes)\n",
                 VM_LOCAL_MAX, (int)(VM_LOCAL_MAX * sizeof(int32_t)));
    platform_log("  VM_FFI_MAX       = %d  (%d bytes)\n",
                 VM_FFI_MAX, (int)(VM_FFI_MAX * sizeof(vm_ffi_fn)));
    platform_log("  VM_MATRIX_STACK  = %d  (%d bytes)\n",
                 VM_MATRIX_STACK, (int)(VM_MATRIX_STACK * sizeof(vm_matrix_t)));
#ifdef VM_ENABLE_PATH
    platform_log("  VM_PATH_MAX_PTS  = %d (%d bytes)\n",
                 VM_PATH_MAX_PTS, (int)(VM_PATH_MAX_PTS * sizeof(vm_path_cmd_t)));
#else
    platform_log("  VM_ENABLE_PATH   = disabled (path support excluded)\n");
#endif
    platform_log("  VM_CALL_STACK    = %d  (%d bytes)\n",
                 VM_CALL_STACK, (int)(VM_CALL_STACK * sizeof(uint32_t)));

    platform_log("\nPlatform context:\n");
    platform_log("  sizeof(vm_device_ctx_t) = %d bytes\n", (int)sizeof(vm_device_ctx_t));
    platform_log("  sizeof(vm_screen_ctx_t) = %d bytes\n", (int)sizeof(vm_screen_ctx_t));
    platform_log("  sizeof(vm_event_t)      = %d bytes\n", (int)sizeof(vm_event_t));
    platform_log("  VM_FFI_MAX              = %d\n", VM_FFI_MAX);

    platform_log("\nStrip buffer examples (canvas_w x strip_h x 3):\n");
    platform_log("  128x1  = %d bytes\n", 128 * 1 * 3);
    platform_log("  160x4  = %d bytes\n", 160 * 4 * 3);
    platform_log("  240x4  = %d bytes\n", 240 * 4 * 3);
    platform_log("  320x4  = %d bytes\n", 320 * 4 * 3);
}
