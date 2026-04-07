#ifndef GRAPHVM_DISPLAY_H
#define GRAPHVM_DISPLAY_H

#include <stdint.h>
#include <stdbool.h>

typedef bool (*display_tick_fn)(uint8_t *rgb, int32_t w, int32_t h, void *user);

void display_write_png(const char *path, const uint8_t *rgb, int32_t w, int32_t h);
void display_show_window(const uint8_t *rgb, int32_t w, int32_t h);
void display_show_window_ex(uint8_t *rgb, int32_t w, int32_t h,
                            display_tick_fn tick, void *user, uint32_t tick_ms);
void display_resize(uint8_t *rgb, int32_t w, int32_t h);

#endif
