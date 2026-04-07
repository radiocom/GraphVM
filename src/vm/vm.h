#ifndef GRAPH_VM_H
#define GRAPH_VM_H

#include <stdint.h>
#include <stdbool.h>

#ifdef __cplusplus
extern "C" {
#endif

#ifndef VM_STACK_SIZE
#define VM_STACK_SIZE     256
#endif
#ifndef VM_LOCAL_MAX
#define VM_LOCAL_MAX      32
#endif
#ifndef VM_MATRIX_STACK
#define VM_MATRIX_STACK   16
#endif
#ifdef VM_ENABLE_PATH
#ifndef VM_PATH_MAX_PTS
#define VM_PATH_MAX_PTS   256
#endif
#endif
#ifndef VM_CALL_STACK
#define VM_CALL_STACK     16
#endif

typedef enum {
    VM_COLOR_MODE_RGB,
    VM_COLOR_MODE_BW,
    VM_COLOR_MODE_BWR,
} vm_color_mode_t;

typedef enum {
    OP_NOP          = 0x00,
    OP_PUSH_I32     = 0x01,
    OP_PUSH_F32     = 0x02,

    OP_ADD          = 0x03,
    OP_SUB          = 0x04,
    OP_MUL          = 0x05,
    OP_DIV          = 0x06,
    OP_MOD          = 0x07,
    OP_NEG          = 0x08,

    OP_FADD         = 0x09,
    OP_FSUB         = 0x0A,
    OP_FMUL         = 0x0B,
    OP_FDIV         = 0x0C,
    OP_FNEG         = 0x0D,

    OP_I2F          = 0x0E,
    OP_F2I          = 0x0F,

    OP_DUP          = 0x10,
    OP_DROP         = 0x11,
    OP_SWAP         = 0x12,

    OP_LOAD_LOCAL   = 0x13,
    OP_STORE_LOCAL  = 0x14,

    OP_CMP_EQ       = 0x15,
    OP_CMP_NE       = 0x16,
    OP_CMP_LT       = 0x17,
    OP_CMP_GT       = 0x18,
    OP_CMP_LE       = 0x19,
    OP_CMP_GE       = 0x1A,
    OP_FCMP_LT      = 0x1B,
    OP_FCMP_GT       = 0x1C,
    OP_FCMP_LE      = 0x1D,
    OP_FCMP_GE      = 0x1E,

    OP_AND          = 0x1F,
    OP_OR           = 0x20,
    OP_NOT          = 0x21,

    OP_JMP          = 0x30,
    OP_JMP_IF       = 0x31,
    OP_JMP_IF_NOT   = 0x32,
    OP_CALL         = 0x33,
    OP_RET          = 0x34,

    OP_SET_COLOR    = 0x40,
    OP_RECT_FILL    = 0x41,
    OP_LINE         = 0x42,
    OP_RECT         = 0x43,

    OP_PUSH_MATRIX  = 0x44,
    OP_POP_MATRIX   = 0x45,
    OP_TRANSLATE    = 0x46,
    OP_ROTATE       = 0x47,
    OP_SCALE        = 0x48,
    OP_CIRCLE       = 0x49,
    OP_CIRCLE_FILL  = 0x4A,

#ifdef VM_ENABLE_PATH
    OP_PATH_BEGIN       = 0x50,
    OP_PATH_MOVE        = 0x51,
    OP_PATH_LINE        = 0x52,
    OP_PATH_CUBIC       = 0x53,
    OP_PATH_CLOSE       = 0x54,
    OP_PATH_FILL        = 0x55,
    OP_PATH_STROKE      = 0x56,
#endif

    OP_TEXT         = 0x60,

    OP_CALL_FFI     = 0x70,

    OP_END          = 0xFF,
} vm_opcode_t;

typedef struct {
    uint8_t r, g, b;
} vm_color_t;

typedef struct {
    float m[6];
} vm_matrix_t;

#ifdef VM_ENABLE_PATH
typedef enum {
    PATH_CMD_MOVE,
    PATH_CMD_LINE,
    PATH_CMD_CUBIC,
} vm_path_cmd_type_t;

typedef struct {
    vm_path_cmd_type_t type;
    float pts[6];
} vm_path_cmd_t;
#endif

struct vm_t;

typedef void (*vm_ffi_fn)(struct vm_t *vm, int32_t *args, uint8_t argc);

typedef struct vm_t {
    int32_t  stack[VM_STACK_SIZE];
    int32_t  sp;

    int32_t  locals[VM_LOCAL_MAX];

    const uint8_t *code;
    const uint8_t *code_end;
    const uint8_t *pc;

    uint32_t call_stack[VM_CALL_STACK];
    int32_t  call_sp;

    vm_color_t current_color;
    float      line_width;

    vm_color_mode_t color_mode;
    vm_color_t      render_color;
    bool            draw_active;

    int32_t canvas_w;
    int32_t canvas_h;
    int32_t strip_length;
    int32_t strip_y0;

    int32_t draw_off_x;
    int32_t draw_off_y;

    uint8_t    *strip_buf;
    vm_color_t  strip_bg;

    vm_matrix_t matrix_stack[VM_MATRIX_STACK];
    int32_t     matrix_sp;

#ifdef VM_ENABLE_PATH
    vm_path_cmd_t path_cmds[VM_PATH_MAX_PTS];
    int32_t       path_count;
    float         path_start_x;
    float         path_start_y;
#endif

    vm_ffi_fn *ffi_table;
    uint8_t    ffi_count;

    const uint8_t *font_res;
    uint32_t       font_res_len;

    bool running;
    bool error;
} vm_t;

bool    vm_step(vm_t *vm);

void vm_run(vm_t *vm, uint32_t pc_offset,
            void (*strip_cb)(int32_t y0, int32_t y1, void *user),
            void *user);

#ifdef __cplusplus
}
#endif

#endif
