#include "vm/vm_font.h"
#include <string.h>

const vm_glyph_entry_t *vm_font_find_glyph(const uint8_t *font_data, uint32_t codepoint) {
    if (!font_data) return NULL;

    const vm_font_header_t *hdr = (const vm_font_header_t *)font_data;
    if (hdr->magic[0] != VM_FONT_MAGIC_0 || hdr->magic[1] != VM_FONT_MAGIC_1)
        return NULL;

    const vm_glyph_entry_t *entries =
        (const vm_glyph_entry_t *)(font_data + sizeof(vm_font_header_t));

    for (uint16_t i = 0; i < hdr->glyph_count; i++) {
        if (entries[i].codepoint == codepoint)
            return &entries[i];
    }
    return NULL;
}

void vm_font_decode_rle_row(const uint8_t *rle_data, uint16_t data_len,
                            uint8_t glyph_w, uint8_t glyph_h,
                            int32_t target_row,
                            uint8_t *row_buf) {
    memset(row_buf, 0, glyph_w);

    if (target_row < 0 || target_row >= glyph_h) return;

    int32_t pixel_idx = 0;
    int32_t row_start = target_row * glyph_w;
    int32_t row_end = row_start + glyph_w;
    uint16_t pos = 0;

    while (pos + 1 < data_len) {
        uint8_t run_len = rle_data[pos];
        uint8_t value   = rle_data[pos + 1];
        pos += 2;

        for (uint8_t r = 0; r < run_len; r++) {
            if (pixel_idx >= row_end) return;
            if (pixel_idx >= row_start) {
                row_buf[pixel_idx - row_start] = value;
            }
            pixel_idx++;
        }
    }
}
