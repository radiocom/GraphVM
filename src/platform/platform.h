#ifndef GRAPH_VM_PLATFORM_H
#define GRAPH_VM_PLATFORM_H

#include "vm/vm.h"
#include <stddef.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>

#ifdef __cplusplus
extern "C" {
#endif

#ifndef VM_FFI_MAX
#define VM_FFI_MAX        16
#endif

#ifndef VM_FLASH_SIZE
#define VM_FLASH_SIZE     8192
#endif

#define VM_EVENT_TICK_SEC  0
#define VM_EVENT_TICK_DAY  1

uint32_t platform_get_time_ms(void);
void platform_delay_ms(uint32_t ms);
void platform_log(const char *fmt, ...);

typedef struct {
    uint8_t *screen;
    int32_t  screen_w;
    int32_t  screen_h;
} vm_screen_ctx_t;

typedef struct {
    uint32_t pc_offset;
    bool     bound;
} vm_event_t;

typedef struct vm_device_ctx_t vm_device_ctx_t;

#define vm_dev_of(vm_ptr) \
    ((vm_device_ctx_t *)((char *)(vm_ptr) - offsetof(vm_device_ctx_t, vm)))

struct vm_device_ctx_t {
    vm_t             vm;
    uint8_t          flash[VM_FLASH_SIZE];
    uint32_t         flash_used;
    uint32_t         code_offset;
    uint32_t         code_len;
    uint32_t         resource_offset;
    uint32_t         resource_len;
    vm_screen_ctx_t  sctx;
    vm_color_t       screen_bg;
    int32_t          win_x;
    int32_t          win_y;
    int32_t          win_w;
    int32_t          win_h;
    vm_color_t       win_bg;
    bool             win_filled;
    bool             partial;
    vm_ffi_fn        ffi_table[VM_FFI_MAX];
    vm_event_t       events[VM_FFI_MAX];
};

static inline bool vm_prepare_flash(vm_device_ctx_t *dev,
                                     const uint8_t *code, uint32_t code_len,
                                     const uint8_t *res,  uint32_t res_len) {
    uint32_t total = code_len + res_len;
    if (total > VM_FLASH_SIZE) return false;

    memcpy(dev->flash, code, code_len);
    dev->code_offset = 0;
    dev->code_len    = code_len;

    if (res && res_len) {
        memcpy(dev->flash + code_len, res, res_len);
        dev->resource_offset = code_len;
        dev->resource_len    = res_len;
    } else {
        dev->resource_offset = 0;
        dev->resource_len    = 0;
    }
    dev->flash_used = total;
    return true;
}

static inline void vm_prepare_screen(vm_device_ctx_t *dev, int32_t w, int32_t h,
                                      int32_t strip_h, vm_color_mode_t color_mode) {
    free(dev->sctx.screen);
    free(dev->vm.strip_buf);

    dev->sctx.screen_w = w;
    dev->sctx.screen_h = h;
    dev->sctx.screen   = (uint8_t *)calloc((size_t)(w * h * 3), 1);

    dev->screen_bg = (vm_color_t){255, 255, 255};
    dev->win_w     = w;
    dev->win_h     = h;

    dev->vm.canvas_w      = w;
    dev->vm.canvas_h      = h;
    dev->vm.strip_length  = w * strip_h;
    dev->vm.color_mode    = color_mode;
    dev->vm.draw_active   = true;

    int32_t bpp = (color_mode != VM_COLOR_MODE_RGB) ? 1 : 3;
    dev->vm.strip_buf = (uint8_t *)calloc((size_t)(dev->vm.strip_length * bpp), 1);
}

static inline void vm_fill_rect(vm_device_ctx_t *dev, int32_t x, int32_t y,
                                 int32_t w, int32_t h, vm_color_t c) {
    vm_screen_ctx_t *ctx = &dev->sctx;
    int32_t x0 = x < 0 ? 0 : x;
    int32_t y0 = y < 0 ? 0 : y;
    int32_t x1 = x + w > ctx->screen_w ? ctx->screen_w : x + w;
    int32_t y1 = y + h > ctx->screen_h ? ctx->screen_h : y + h;
    for (int32_t r = y0; r < y1; r++) {
        uint8_t *row = ctx->screen + (size_t)(r * ctx->screen_w + x0) * 3;
        for (int32_t cx = x0; cx < x1; cx++) {
            *row++ = c.r; *row++ = c.g; *row++ = c.b;
        }
    }
}

static inline void vm_clear_screen(vm_device_ctx_t *dev, vm_color_t bg) {
    vm_fill_rect(dev, 0, 0, dev->sctx.screen_w, dev->sctx.screen_h, bg);
}

static void ffi_log(vm_t *vm, int32_t *args, uint8_t argc) {
    (void)vm;
    for (uint8_t i = 0; i < argc; i++) platform_log("%d ", args[i]);
    platform_log("\n");
}

static void ffi_set_window(vm_t *vm, int32_t *args, uint8_t argc) {
    if (argc < 7) return;
    vm_device_ctx_t *dev = vm_dev_of(vm);
    dev->win_x = args[0];
    dev->win_y = args[1];
    dev->win_w = args[2];
    dev->win_h = args[3];
    dev->win_bg.r = (uint8_t)args[4];
    dev->win_bg.g = (uint8_t)args[5];
    dev->win_bg.b = (uint8_t)args[6];
    vm->draw_off_x = args[0];
    vm->draw_off_y = args[1];

    if (vm->color_mode == VM_COLOR_MODE_RGB) {
        int32_t strip_h = vm->strip_length / vm->canvas_w;
        int32_t sy0 = vm->strip_y0;
        int32_t sy1 = sy0 + strip_h;
        int32_t wy0 = args[1] < sy0 ? sy0 : args[1];
        int32_t wy1 = args[1] + args[3];
        if (wy1 > sy1) wy1 = sy1;
        int32_t wx0 = args[0] < 0 ? 0 : args[0];
        int32_t wx1 = args[0] + args[2];
        if (wx1 > vm->canvas_w) wx1 = vm->canvas_w;
        for (int32_t r = wy0; r < wy1; r++) {
            uint8_t *row = vm->strip_buf + (size_t)((r - sy0) * vm->canvas_w + wx0) * 3;
            for (int32_t c = wx0; c < wx1; c++) {
                *row++ = dev->win_bg.r;
                *row++ = dev->win_bg.g;
                *row++ = dev->win_bg.b;
            }
        }
    } else if (!dev->win_filled) {
        vm_fill_rect(dev, dev->win_x, dev->win_y, dev->win_w, dev->win_h, dev->win_bg);
        dev->win_filled = true;
    }
}

static void ffi_bind_event(vm_t *vm, int32_t *args, uint8_t argc) {
    if (argc < 2) return;
    vm_device_ctx_t *dev = vm_dev_of(vm);
    uint8_t event_id = (uint8_t)args[0];
    if (event_id < VM_FFI_MAX) {
        dev->events[event_id].pc_offset = (uint32_t)args[1];
        dev->events[event_id].bound = true;
    }
}

static inline void vm_boot_checkpoint(vm_device_ctx_t *dev, const uint8_t *snapshot) {
    vm_t *vm = &dev->vm;

    dev->ffi_table[0] = ffi_log;
    dev->ffi_table[1] = ffi_set_window;
    dev->ffi_table[2] = ffi_bind_event;
    vm->ffi_table = dev->ffi_table;
    vm->ffi_count = 3;

    vm->code      = dev->flash + dev->code_offset;
    vm->code_end  = dev->flash + dev->code_offset + dev->code_len;
    if (dev->resource_len > 0) {
        vm->font_res     = dev->flash + dev->resource_offset;
        vm->font_res_len = dev->resource_len;
    }
    if (snapshot)
        memcpy(vm->locals, snapshot, sizeof(vm->locals));
    memset(vm->stack, 0, sizeof(vm->stack));
    memset(vm->call_stack, 0, sizeof(vm->call_stack));
}

static inline void vm_strip_to_screen(int32_t y0, int32_t y1, void *user) {
    vm_device_ctx_t *dev = (vm_device_ctx_t *)user;
    vm_t *vm = &dev->vm;
    vm_screen_ctx_t *ctx = &dev->sctx;
    int32_t rows = y1 - y0;
    int32_t sw = ctx->screen_w;

    int32_t x0 = 0, x1 = sw;
    int32_t wy0 = y0, wy1 = y1;
    if (dev->partial) {
        x0 = dev->win_x < 0 ? 0 : dev->win_x;
        x1 = dev->win_x + dev->win_w;
        if (x1 > sw) x1 = sw;
        wy0 = dev->win_y < y0 ? y0 : dev->win_y;
        wy1 = dev->win_y + dev->win_h;
        if (wy1 > y1) wy1 = y1;
    }

    if (vm->color_mode == VM_COLOR_MODE_RGB) {
        for (int32_t r = wy0; r < wy1; r++) {
            size_t src_off = (size_t)((r - y0) * sw + x0) * 3;
            size_t dst_off = (size_t)(r * sw + x0) * 3;
            memcpy(ctx->screen + dst_off, vm->strip_buf + src_off,
                   (size_t)(x1 - x0) * 3);
        }
    } else {
        uint8_t dr = vm->render_color.r;
        uint8_t dg = vm->render_color.g;
        uint8_t db = vm->render_color.b;
        for (int32_t r = wy0; r < wy1; r++) {
            const uint8_t *src = vm->strip_buf + (r - y0) * vm->canvas_w;
            for (int32_t cx = x0; cx < x1; cx++) {
                if (!src[cx]) continue;
                size_t di = (size_t)((r * sw + cx) * 3);
                ctx->screen[di]     = dr;
                ctx->screen[di + 1] = dg;
                ctx->screen[di + 2] = db;
            }
        }
    }
}

static inline void vm_run_at(vm_device_ctx_t *dev, uint32_t pc_offset) {
    vm_t *vm = &dev->vm;
    dev->win_filled = false;

    if (vm->color_mode == VM_COLOR_MODE_RGB) {
        vm->strip_bg = dev->screen_bg;
        vm_run(vm, pc_offset, vm_strip_to_screen, dev);
    } else {
        vm->render_color = (vm_color_t){0, 0, 0};
        vm_run(vm, pc_offset, vm_strip_to_screen, dev);
        if (vm->color_mode == VM_COLOR_MODE_BWR) {
            vm->render_color = (vm_color_t){255, 0, 0};
            vm_run(vm, pc_offset, vm_strip_to_screen, dev);
        }
    }
}

static inline void vm_render(vm_device_ctx_t *dev) {
    vm_clear_screen(dev, dev->screen_bg);
    dev->partial = false;
    vm_run_at(dev, 0);
}

static inline bool vm_fire_event(vm_device_ctx_t *dev, uint8_t event_id) {
    if (event_id >= VM_FFI_MAX || !dev->events[event_id].bound)
        return false;
    dev->partial = true;
    vm_run_at(dev, dev->events[event_id].pc_offset);
    dev->partial = false;
    return true;
}

#ifdef __cplusplus
}
#endif

#endif
