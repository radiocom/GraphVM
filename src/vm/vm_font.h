#ifndef VM_FONT_H
#define VM_FONT_H

#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

#define VM_FONT_MAGIC_0 'G'
#define VM_FONT_MAGIC_1 'F'

#pragma pack(push, 1)

typedef struct {
    uint8_t  magic[2];
    uint8_t  font_size;
    uint16_t glyph_count;
    uint16_t data_size;
} vm_font_header_t;

typedef struct {
    uint32_t codepoint;
    uint8_t  width;
    uint8_t  height;
    uint8_t  advance_x;
    int8_t   bearing_x;
    int8_t   bearing_y;
    uint16_t data_offset;
    uint16_t data_length;
} vm_glyph_entry_t;

#pragma pack(pop)

const vm_glyph_entry_t *vm_font_find_glyph(const uint8_t *font_data, uint32_t codepoint);

void vm_font_decode_rle_row(const uint8_t *rle_data, uint16_t data_len,
                            uint8_t glyph_w, uint8_t glyph_h,
                            int32_t target_row,
                            uint8_t *row_buf);

#ifdef __cplusplus
}
#endif

#endif
