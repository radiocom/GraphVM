#include "gvmb_loader.h"
#include "platform/platform.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>

#define SECTION_BYTECODE  0x01
#define SECTION_RESOURCE  0x02
#define SECTION_CONFIG    0x03
#define SECTION_CANVAS    0x04
#define SECTION_SUBFUNC   0x05

static uint32_t read_u32le(const uint8_t *p) {
    return (uint32_t)p[0] | ((uint32_t)p[1] << 8) |
           ((uint32_t)p[2] << 16) | ((uint32_t)p[3] << 24);
}

static uint16_t read_u16le(const uint8_t *p) {
    return (uint16_t)((uint16_t)p[0] | ((uint16_t)p[1] << 8));
}

uint8_t *gvmb_load_file(const char *path, uint32_t *out_size) {
    FILE *f = fopen(path, "rb");
    if (!f) return NULL;
    fseek(f, 0, SEEK_END);
    long len = ftell(f);
    fseek(f, 0, SEEK_SET);
    if (len <= 0) { fclose(f); return NULL; }
    uint8_t *buf = (uint8_t *)malloc((size_t)len);
    if (!buf) { fclose(f); return NULL; }
    if (fread(buf, 1, (size_t)len, f) != (size_t)len) {
        free(buf);
        fclose(f);
        return NULL;
    }
    fclose(f);
    *out_size = (uint32_t)len;
    return buf;
}

bool gvmb_parse(gvmb_bundle_t *bundle) {
    if (bundle->raw_size < 8) return false;

    uint32_t magic = read_u32le(bundle->raw);
    uint32_t version = read_u32le(bundle->raw + 4);
    if (magic != GVMB_MAGIC) {
        platform_log("bad GVMB magic: 0x%08X\n", magic);
        return false;
    }
    if (version != 1) {
        platform_log("unsupported GVMB version: %u\n", version);
        return false;
    }

    bundle->bytecode.data = NULL;
    bundle->bytecode.size = 0;
    bundle->resource_count = 0;
    bundle->subfunc_count = 0;
    memset(&bundle->config, 0, sizeof(bundle->config));
    bundle->canvas_w = 0;
    bundle->canvas_h = 0;
    bundle->color_mode = 0;

    uint32_t off = 8;
    while (off + 5 <= bundle->raw_size) {
        uint8_t  sec_type = bundle->raw[off];
        uint32_t sec_len  = read_u32le(bundle->raw + off + 1);
        off += 5;

        if (off + sec_len > bundle->raw_size) {
            platform_log("truncated section type=0x%02X\n", sec_type);
            return false;
        }

        const uint8_t *sec_data = bundle->raw + off;

        switch (sec_type) {
        case SECTION_CANVAS:
            if (sec_len >= 8) {
                bundle->canvas_w = (int32_t)read_u32le(sec_data);
                bundle->canvas_h = (int32_t)read_u32le(sec_data + 4);
            }
            if (sec_len >= 12) {
                bundle->color_mode = sec_data[8];
            }
            break;

        case SECTION_BYTECODE:
            bundle->bytecode.data = (uint8_t *)sec_data;
            bundle->bytecode.size = sec_len;
            break;

        case SECTION_RESOURCE: {
            if (bundle->resource_count >= GVMB_MAX_RESOURCES || sec_len < 1) break;
            uint8_t name_len = sec_data[0];
            if ((uint32_t)(1 + name_len) > sec_len) break;
            gvmb_resource_t *res = &bundle->resources[bundle->resource_count];
            uint8_t copy_len = name_len < 127 ? name_len : 127;
            memcpy(res->name, sec_data + 1, copy_len);
            res->name[copy_len] = '\0';
            res->data = (uint8_t *)(sec_data + 1 + name_len);
            res->size = sec_len - 1 - name_len;
            bundle->resource_count++;
            break;
        }

        case SECTION_CONFIG:
            if (sec_len >= 4) {
                bundle->config.refresh_interval_ms = read_u16le(sec_data);
                bundle->config.timer_count = sec_data[2];
                uint32_t tc = bundle->config.timer_count;
                if (tc > GVMB_MAX_TIMERS) tc = GVMB_MAX_TIMERS;
                for (uint32_t i = 0; i < tc && 4 + i * 4 + 4 <= sec_len; i++) {
                    const uint8_t *tp = sec_data + 4 + i * 4;
                    bundle->config.timers[i].id = tp[0];
                    bundle->config.timers[i].interval_ms = read_u16le(tp + 2);
                }
            }
            break;

        case SECTION_SUBFUNC:
            if (sec_len >= 1) {
                uint8_t count = sec_data[0];
                if (count > GVMB_MAX_SUBFUNCS) count = GVMB_MAX_SUBFUNCS;
                for (uint8_t i = 0; i < count && 1 + (uint32_t)i * 8 + 8 <= sec_len; i++) {
                    const uint8_t *sfp = sec_data + 1 + i * 8;
                    bundle->subfuncs[i].timer_id = sfp[0];
                    bundle->subfuncs[i].offset = read_u32le(sfp + 4);
                }
                bundle->subfunc_count = count;
            }
            break;

        default:
            break;
        }

        off += sec_len;
    }

    return bundle->bytecode.data != NULL && bundle->bytecode.size > 0;
}

const gvmb_resource_t *gvmb_find_font(const gvmb_bundle_t *bundle) {
    for (int i = 0; i < bundle->resource_count; i++) {
        if (strncmp(bundle->resources[i].name, "font:", 5) == 0)
            return &bundle->resources[i];
    }
    return NULL;
}

static void get_file_stat(const char *path, int64_t *mtime, uint32_t *fsize) {
    struct _stat64 st;
    if (_stat64(path, &st) == 0) {
        *mtime = (int64_t)st.st_mtime;
        *fsize = (uint32_t)st.st_size;
    } else {
        *mtime = 0;
        *fsize = 0;
    }
}

void gvmb_watch_init(gvmb_watch_t *w, const char *path) {
    w->path = path;
    get_file_stat(path, &w->last_mtime, &w->last_size);
}

bool gvmb_watch_changed(gvmb_watch_t *w) {
    int64_t mtime;
    uint32_t fsize;
    get_file_stat(w->path, &mtime, &fsize);
    if (mtime != w->last_mtime || fsize != w->last_size) {
        w->last_mtime = mtime;
        w->last_size = fsize;
        return true;
    }
    return false;
}

bool gvmb_reload(gvmb_bundle_t *bundle, const char *path) {
    uint32_t new_size = 0;
    uint8_t *new_raw = gvmb_load_file(path, &new_size);
    if (!new_raw) return false;

    gvmb_bundle_t new_bundle;
    memset(&new_bundle, 0, sizeof(new_bundle));
    new_bundle.raw = new_raw;
    new_bundle.raw_size = new_size;

    if (!gvmb_parse(&new_bundle)) {
        free(new_raw);
        return false;
    }

    free(bundle->raw);
    *bundle = new_bundle;
    return true;
}
