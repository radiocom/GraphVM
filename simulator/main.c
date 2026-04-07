#include "platform/platform.h"
#include "display.h"
#include "gvmb_loader.h"
#include "sizeof_report.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define SIM_STRIP_H  4

typedef struct {
    vm_device_ctx_t    dev;
    gvmb_watch_t       watch;
    int32_t            canvas_w_override;
    int32_t            canvas_h_override;
    bool               canvas_size_explicit;
    bool               color_mode_explicit;
    vm_color_mode_t    color_mode_override;
    uint32_t           last_tick_sec;
    uint32_t           last_tick_day;
} sim_ctx_t;

static vm_color_mode_t bundle_color_mode(uint8_t m) {
    switch (m) {
        case 1: return VM_COLOR_MODE_BW;
        case 2: return VM_COLOR_MODE_BWR;
        default: return VM_COLOR_MODE_RGB;
    }
}

static const char *color_mode_name(vm_color_mode_t m) {
    switch (m) {
        case VM_COLOR_MODE_BW:  return "bw";
        case VM_COLOR_MODE_BWR: return "bwr";
        default:                return "rgb";
    }
}

static vm_color_mode_t parse_color_mode(const char *s) {
    if (strcmp(s, "bw") == 0)  return VM_COLOR_MODE_BW;
    if (strcmp(s, "bwr") == 0) return VM_COLOR_MODE_BWR;
    if (strcmp(s, "rgb") == 0) return VM_COLOR_MODE_RGB;
    return VM_COLOR_MODE_BWR;
}

static bool vm_reload(sim_ctx_t *ctx, const char *path) {
    uint32_t file_size = 0;
    uint8_t *file_data = gvmb_load_file(path, &file_size);
    if (!file_data) return false;

    gvmb_bundle_t bundle;
    memset(&bundle, 0, sizeof(bundle));
    bundle.raw = file_data;
    bundle.raw_size = file_size;
    if (!gvmb_parse(&bundle)) {
        free(file_data);
        return false;
    }

    vm_device_ctx_t *dev = &ctx->dev;
    const gvmb_resource_t *font = gvmb_find_font(&bundle);

    if (!vm_prepare_flash(dev,
            bundle.bytecode.data, bundle.bytecode.size,
            font ? font->data : NULL, font ? font->size : 0)) {
        free(file_data);
        return false;
    }
    free(file_data);

    int32_t w = ctx->canvas_w_override;
    int32_t h = ctx->canvas_h_override;
    if (!ctx->canvas_size_explicit) {
        w = bundle.canvas_w > 0 ? bundle.canvas_w : 160;
        h = bundle.canvas_h > 0 ? bundle.canvas_h : 120;
    }

    vm_color_mode_t mode = ctx->color_mode_explicit
        ? ctx->color_mode_override
        : bundle_color_mode(bundle.color_mode);
    vm_prepare_screen(dev, w, h, SIM_STRIP_H, mode);

    memset(dev->vm.locals, 0, sizeof(dev->vm.locals));
    memset(dev->events, 0, sizeof(dev->events));
    vm_boot_checkpoint(dev, NULL);
    return true;
}

static bool on_tick(uint8_t *rgb, int32_t w, int32_t h, void *user) {
    (void)rgb; (void)w; (void)h;
    sim_ctx_t *ctx = (sim_ctx_t *)user;
    bool updated = false;

    if (gvmb_watch_changed(&ctx->watch)) {
        if (!vm_reload(ctx, ctx->watch.path)) {
            platform_log("reload failed\n");
            return false;
        }
        vm_render(&ctx->dev);
        display_resize(ctx->dev.sctx.screen,
                       ctx->dev.sctx.screen_w, ctx->dev.sctx.screen_h);
        return true;
    }

    uint32_t now = platform_get_time_ms();

    if (now - ctx->last_tick_sec >= 1000) {
        ctx->last_tick_sec = now;
        if (vm_fire_event(&ctx->dev, VM_EVENT_TICK_SEC))
            updated = true;
    }

    if (now - ctx->last_tick_day >= 86400000) {
        ctx->last_tick_day = now;
        if (vm_fire_event(&ctx->dev, VM_EVENT_TICK_DAY))
            updated = true;
    }

    return updated;
}

static void print_usage(const char *prog) {
    platform_log("Usage: %s [options] <file.gvmb>\n", prog);
    platform_log("  -d WxH     device resolution\n");
    platform_log("  -m MODE    color mode: rgb, bw, bwr\n");
    platform_log("  -out FILE  write PNG\n");
    platform_log("  -s         sizeof report\n");
}

int main(int argc, char *argv[]) {
    sim_ctx_t ctx;
    memset(&ctx, 0, sizeof(ctx));

    const char *out_file = NULL;
    const char *gvmb_file = NULL;

    for (int i = 1; i < argc; i++) {
        if (strcmp(argv[i], "-s") == 0) {
            print_sizeof_report();
            return 0;
        } else if (strcmp(argv[i], "-d") == 0 && i + 1 < argc) {
            i++;
            if (sscanf(argv[i], "%dx%d", &ctx.canvas_w_override, &ctx.canvas_h_override) != 2 &&
                sscanf(argv[i], "%d*%d", &ctx.canvas_w_override, &ctx.canvas_h_override) != 2) {
                platform_log("invalid resolution '%s'\n", argv[i]);
                return 1;
            }
            ctx.canvas_size_explicit = true;
        } else if (strcmp(argv[i], "-m") == 0 && i + 1 < argc) {
            ctx.color_mode_override = parse_color_mode(argv[++i]);
            ctx.color_mode_explicit = true;
        } else if (strcmp(argv[i], "-out") == 0 && i + 1 < argc) {
            out_file = argv[++i];
        } else if (strcmp(argv[i], "-h") == 0 || strcmp(argv[i], "--help") == 0) {
            print_usage(argv[0]);
            return 0;
        } else if (argv[i][0] != '-') {
            gvmb_file = argv[i];
        }
    }

    if (!gvmb_file) {
        print_usage(argv[0]);
        return 1;
    }

    if (!vm_reload(&ctx, gvmb_file)) {
        platform_log("failed to load '%s'\n", gvmb_file);
        return 1;
    }

    gvmb_watch_init(&ctx.watch, gvmb_file);
    ctx.last_tick_sec = platform_get_time_ms();
    ctx.last_tick_day = ctx.last_tick_sec;

    vm_render(&ctx.dev);

    platform_log("graphVM: %dx%d mode=%s strip=%d\n",
                 ctx.dev.sctx.screen_w, ctx.dev.sctx.screen_h,
                 color_mode_name(ctx.dev.vm.color_mode), SIM_STRIP_H);

    if (out_file) {
        char png_path[512];
        snprintf(png_path, sizeof(png_path), "%s.png", out_file);
        display_write_png(png_path, ctx.dev.sctx.screen,
                         ctx.dev.sctx.screen_w, ctx.dev.sctx.screen_h);
    } else {
        display_show_window_ex(ctx.dev.sctx.screen,
                              ctx.dev.sctx.screen_w, ctx.dev.sctx.screen_h,
                              on_tick, &ctx, 500);
    }

    free(ctx.dev.sctx.screen);
    free(ctx.dev.vm.strip_buf);
    return 0;
}
