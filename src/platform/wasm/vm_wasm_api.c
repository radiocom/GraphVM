#include "platform/platform.h"
#include <emscripten/emscripten.h>
#include <stdlib.h>
#include <string.h>

static vm_device_ctx_t g_ctx;

EMSCRIPTEN_KEEPALIVE
void vm_wasm_reload(int32_t w, int32_t h, int32_t strip_h, int32_t color_mode,
                    const uint8_t *data, uint32_t code_off, uint32_t code_len,
                    uint32_t res_off, uint32_t res_len) {
    free(g_ctx.vm.strip_buf);
    free(g_ctx.sctx.screen);
    memset(&g_ctx, 0, sizeof(g_ctx));

    vm_prepare_screen(&g_ctx, w, h, strip_h, (vm_color_mode_t)color_mode);

    if (code_len) {
        vm_prepare_flash(&g_ctx,
            data + code_off, code_len,
            res_len ? data + res_off : NULL, res_len);
    }

    vm_boot_checkpoint(&g_ctx, NULL);
}

EMSCRIPTEN_KEEPALIVE
uint8_t *vm_wasm_get_framebuf(void) { return g_ctx.sctx.screen; }

EMSCRIPTEN_KEEPALIVE
void vm_wasm_run(void) {
    vm_render(&g_ctx);
}

EMSCRIPTEN_KEEPALIVE
int32_t vm_wasm_fire_event(uint8_t event_id) {
    return vm_fire_event(&g_ctx, event_id) ? 1 : 0;
}

EMSCRIPTEN_KEEPALIVE
void vm_wasm_destroy(void) {
    free(g_ctx.vm.strip_buf);
    free(g_ctx.sctx.screen);
    memset(&g_ctx, 0, sizeof(g_ctx));
}
