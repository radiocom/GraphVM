#ifndef MINPNG_H
#define MINPNG_H

#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#ifdef __cplusplus
extern "C" {
#endif

static uint32_t minpng_crc_table[256];
static int minpng_crc_ready = 0;

static void minpng_init_crc(void) {
    if (minpng_crc_ready) return;
    for (uint32_t n = 0; n < 256; n++) {
        uint32_t c = n;
        for (int k = 0; k < 8; k++)
            c = (c & 1) ? (0xEDB88320UL ^ (c >> 1)) : (c >> 1);
        minpng_crc_table[n] = c;
    }
    minpng_crc_ready = 1;
}

static uint32_t minpng_crc(const uint8_t *buf, size_t len) {
    minpng_init_crc();
    uint32_t c = 0xFFFFFFFF;
    for (size_t i = 0; i < len; i++)
        c = minpng_crc_table[(c ^ buf[i]) & 0xFF] ^ (c >> 8);
    return c ^ 0xFFFFFFFF;
}

static uint32_t minpng_adler32(const uint8_t *buf, size_t len) {
    uint32_t a = 1, b = 0;
    for (size_t i = 0; i < len; i++) {
        a = (a + buf[i]) % 65521;
        b = (b + a) % 65521;
    }
    return (b << 16) | a;
}

static void minpng_put32be(uint8_t *p, uint32_t v) {
    p[0] = (uint8_t)(v >> 24);
    p[1] = (uint8_t)(v >> 16);
    p[2] = (uint8_t)(v >> 8);
    p[3] = (uint8_t)(v);
}

static void minpng_put16le(uint8_t *p, uint16_t v) {
    p[0] = (uint8_t)(v);
    p[1] = (uint8_t)(v >> 8);
}

static void minpng_write_chunk(FILE *f, const char *type, const uint8_t *data, uint32_t len) {
    uint8_t hdr[8];
    minpng_put32be(hdr, len);
    memcpy(hdr + 4, type, 4);
    fwrite(hdr, 1, 8, f);

    uint8_t *crc_buf = (uint8_t *)malloc(4 + len);
    memcpy(crc_buf, type, 4);
    if (len > 0) memcpy(crc_buf + 4, data, len);
    uint32_t crc = minpng_crc(crc_buf, 4 + len);
    free(crc_buf);

    if (len > 0) fwrite(data, 1, len, f);
    uint8_t crc_bytes[4];
    minpng_put32be(crc_bytes, crc);
    fwrite(crc_bytes, 1, 4, f);
}

static int minpng_write(const char *filename, const uint8_t *rgb, int32_t w, int32_t h) {
    FILE *f = fopen(filename, "wb");
    if (!f) return -1;

    static const uint8_t png_sig[8] = {137, 80, 78, 71, 13, 10, 26, 10};
    fwrite(png_sig, 1, 8, f);

    uint8_t ihdr[13];
    minpng_put32be(ihdr + 0, (uint32_t)w);
    minpng_put32be(ihdr + 4, (uint32_t)h);
    ihdr[8]  = 8;
    ihdr[9]  = 2;
    ihdr[10] = 0;
    ihdr[11] = 0;
    ihdr[12] = 0;
    minpng_write_chunk(f, "IHDR", ihdr, 13);

    size_t raw_row = (size_t)(1 + w * 3);
    size_t raw_size = raw_row * (size_t)h;
    uint8_t *raw = (uint8_t *)malloc(raw_size);

    for (int32_t y = 0; y < h; y++) {
        raw[y * raw_row] = 0;
        memcpy(raw + y * raw_row + 1, rgb + y * w * 3, (size_t)(w * 3));
    }

    uint32_t adler = minpng_adler32(raw, raw_size);

    size_t max_blocks = (raw_size + 65534) / 65535;
    size_t deflate_size = 2 + raw_size + 5 * max_blocks + 4;
    uint8_t *deflate_buf = (uint8_t *)malloc(deflate_size);

    size_t pos = 0;
    deflate_buf[pos++] = 0x78;
    deflate_buf[pos++] = 0x01;

    size_t remaining = raw_size;
    size_t src_pos = 0;
    while (remaining > 0) {
        uint16_t block_len = remaining > 65535 ? 65535 : (uint16_t)remaining;
        uint8_t is_last = (remaining <= 65535) ? 1 : 0;
        deflate_buf[pos++] = is_last;
        minpng_put16le(deflate_buf + pos, block_len); pos += 2;
        uint16_t nlen = ~block_len;
        minpng_put16le(deflate_buf + pos, nlen); pos += 2;
        memcpy(deflate_buf + pos, raw + src_pos, block_len);
        pos += block_len;
        src_pos += block_len;
        remaining -= block_len;
    }

    minpng_put32be(deflate_buf + pos, adler);
    pos += 4;

    minpng_write_chunk(f, "IDAT", deflate_buf, (uint32_t)pos);

    free(deflate_buf);
    free(raw);

    minpng_write_chunk(f, "IEND", NULL, 0);
    fclose(f);
    return 0;
}

#ifdef __cplusplus
}
#endif

#endif
