#ifndef GVMB_LOADER_H
#define GVMB_LOADER_H

#include <stdint.h>
#include <stdbool.h>
#include "platform/platform.h"

#define GVMB_MAGIC         0x47564D42
#define GVMB_MAX_RESOURCES 32
#define GVMB_MAX_SUBFUNCS  8
#define GVMB_MAX_TIMERS    8

typedef struct {
    uint8_t *data;
    uint32_t size;
} gvmb_bytecode_t;

typedef struct {
    char     name[128];
    uint8_t *data;
    uint32_t size;
} gvmb_resource_t;

typedef struct {
    uint16_t refresh_interval_ms;
    uint8_t  timer_count;
    struct {
        uint8_t  id;
        uint16_t interval_ms;
    } timers[GVMB_MAX_TIMERS];
} gvmb_config_t;

typedef struct {
    uint8_t  timer_id;
    uint32_t offset;
} gvmb_subfunc_t;

typedef struct {
    gvmb_bytecode_t  bytecode;
    gvmb_resource_t  resources[GVMB_MAX_RESOURCES];
    int              resource_count;
    gvmb_config_t    config;
    gvmb_subfunc_t   subfuncs[GVMB_MAX_SUBFUNCS];
    int              subfunc_count;
    int32_t          canvas_w;
    int32_t          canvas_h;
    uint8_t          color_mode;   /* 0=rgb, 1=bw, 2=bwr */
    uint8_t         *raw;
    uint32_t         raw_size;
} gvmb_bundle_t;

typedef struct {
    const char *path;
    int64_t     last_mtime;
    uint32_t    last_size;
} gvmb_watch_t;

uint8_t *gvmb_load_file(const char *path, uint32_t *out_size);
bool     gvmb_parse(gvmb_bundle_t *bundle);
const gvmb_resource_t *gvmb_find_font(const gvmb_bundle_t *bundle);

void gvmb_watch_init(gvmb_watch_t *w, const char *path);
bool gvmb_watch_changed(gvmb_watch_t *w);
bool gvmb_reload(gvmb_bundle_t *bundle, const char *path);

#endif
