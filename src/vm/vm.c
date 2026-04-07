#include "vm/vm.h"
#include "vm/vm_font.h"
#include <stdlib.h>
#include <string.h>
#include <math.h>

static inline void push(vm_t *vm, int32_t val) {
    if (vm->sp >= VM_STACK_SIZE) { vm->error = true; vm->running = false; return; }
    vm->stack[vm->sp++] = val;
}

static inline int32_t pop(vm_t *vm) {
    if (vm->sp <= 0) { vm->error = true; vm->running = false; return 0; }
    return vm->stack[--vm->sp];
}

static inline void push_f32(vm_t *vm, float val) {
    int32_t bits; memcpy(&bits, &val, sizeof(bits)); push(vm, bits);
}

static inline float pop_f32(vm_t *vm) {
    int32_t bits = pop(vm); float val; memcpy(&val, &bits, sizeof(val)); return val;
}

static inline int32_t read_i32(vm_t *vm) {
    if (vm->pc + 4 > vm->code_end) { vm->error = true; vm->running = false; return 0; }
    int32_t val = (int32_t)((uint32_t)vm->pc[0] | ((uint32_t)vm->pc[1] << 8) |
                  ((uint32_t)vm->pc[2] << 16) | ((uint32_t)vm->pc[3] << 24));
    vm->pc += 4;
    return val;
}

static inline float read_f32(vm_t *vm) {
    int32_t bits = read_i32(vm); float val; memcpy(&val, &bits, sizeof(val)); return val;
}

static inline uint8_t read_u8(vm_t *vm) {
    if (vm->pc >= vm->code_end) { vm->error = true; vm->running = false; return 0; }
    return *vm->pc++;
}

static void matrix_identity(vm_matrix_t *m) {
    m->m[0] = 1; m->m[1] = 0; m->m[2] = 0; m->m[3] = 1; m->m[4] = 0; m->m[5] = 0;
}

static void matrix_multiply(vm_matrix_t *dst, const vm_matrix_t *a, const vm_matrix_t *b) {
    vm_matrix_t r;
    r.m[0] = a->m[0]*b->m[0] + a->m[2]*b->m[1];
    r.m[1] = a->m[1]*b->m[0] + a->m[3]*b->m[1];
    r.m[2] = a->m[0]*b->m[2] + a->m[2]*b->m[3];
    r.m[3] = a->m[1]*b->m[2] + a->m[3]*b->m[3];
    r.m[4] = a->m[0]*b->m[4] + a->m[2]*b->m[5] + a->m[4];
    r.m[5] = a->m[1]*b->m[4] + a->m[3]*b->m[5] + a->m[5];
    *dst = r;
}

static void matrix_transform(const vm_matrix_t *m, float x, float y, float *ox, float *oy) {
    *ox = m->m[0]*x + m->m[2]*y + m->m[4];
    *oy = m->m[1]*x + m->m[3]*y + m->m[5];
}

static vm_matrix_t *current_matrix(vm_t *vm) {
    return &vm->matrix_stack[vm->matrix_sp];
}

static inline bool is_binary_mode(const vm_t *vm) {
    return vm->color_mode != VM_COLOR_MODE_RGB;
}

static bool color_matches_render(const vm_t *vm, vm_color_t c) {
    return c.r == vm->render_color.r &&
           c.g == vm->render_color.g &&
           c.b == vm->render_color.b;
}

static inline int32_t vm_strip_h(const vm_t *vm) {
    return vm->strip_length / vm->canvas_w;
}

static inline void strip_set_pixel(vm_t *vm, int32_t cx, int32_t cy, vm_color_t c) {
    int32_t sx = cx + vm->draw_off_x;
    int32_t sy = cy + vm->draw_off_y;
    if (sx < 0 || sx >= vm->canvas_w) return;
    if (sy < vm->strip_y0 || sy >= vm->strip_y0 + vm_strip_h(vm)) return;
    if (is_binary_mode(vm)) {
        if (!vm->draw_active) return;
        vm->strip_buf[(sy - vm->strip_y0) * vm->canvas_w + sx] = 0xFF;
    } else {
        int32_t idx = ((sy - vm->strip_y0) * vm->canvas_w + sx) * 3;
        vm->strip_buf[idx] = c.r;
        vm->strip_buf[idx + 1] = c.g;
        vm->strip_buf[idx + 2] = c.b;
    }
}

static void draw_rect_fill(vm_t *vm, int32_t x, int32_t y, int32_t w, int32_t h) {
    int32_t ox = vm->draw_off_x, oy = vm->draw_off_y;
    int32_t x0 = x < 0 ? 0 : x;
    int32_t y0 = y < 0 ? 0 : y;
    int32_t x1 = x + w > vm->canvas_w - ox ? vm->canvas_w - ox : x + w;
    int32_t y1 = y + h > vm->canvas_h - oy ? vm->canvas_h - oy : y + h;
    int32_t sy0 = vm->strip_y0 - oy;
    int32_t sy1 = sy0 + vm_strip_h(vm);
    if (y0 < sy0) y0 = sy0;
    if (y1 > sy1) y1 = sy1;
    for (int32_t r = y0; r < y1; r++)
        for (int32_t c = x0; c < x1; c++)
            strip_set_pixel(vm, c, r, vm->current_color);
}

static void draw_line_bresenham(vm_t *vm, float fx0, float fy0, float fx1, float fy1, float width) {
    int32_t x0 = (int32_t)(fx0 + 0.5f), y0 = (int32_t)(fy0 + 0.5f);
    int32_t x1 = (int32_t)(fx1 + 0.5f), y1 = (int32_t)(fy1 + 0.5f);
    int32_t dx = abs(x1 - x0), dy = -abs(y1 - y0);
    int32_t sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    int32_t err = dx + dy, hw = (int32_t)(width * 0.5f);
    for (;;) {
        for (int32_t wy = -hw; wy <= hw; wy++)
            for (int32_t wx = -hw; wx <= hw; wx++)
                strip_set_pixel(vm, x0 + wx, y0 + wy, vm->current_color);
        if (x0 == x1 && y0 == y1) break;
        int32_t e2 = 2 * err;
        if (e2 >= dy) { err += dy; x0 += sx; }
        if (e2 <= dx) { err += dx; y0 += sy; }
    }
}

static void draw_rect_transformed(vm_t *vm, float x, float y, float w, float h, float r) {
    vm_matrix_t *mat = current_matrix(vm);
    if (mat->m[0] == 1 && mat->m[1] == 0 && mat->m[2] == 0 && mat->m[3] == 1 && r == 0) {
        draw_rect_fill(vm, (int32_t)(x + mat->m[4] + 0.5f), (int32_t)(y + mat->m[5] + 0.5f),
                       (int32_t)(w + 0.5f), (int32_t)(h + 0.5f));
        return;
    }
    float det = mat->m[0]*mat->m[3] - mat->m[1]*mat->m[2];
    if (fabsf(det) < 1e-6f) return;
    float id = 1.0f / det;
    float i0 = mat->m[3]*id, i1 = -mat->m[1]*id, i2 = -mat->m[2]*id, i3 = mat->m[0]*id;
    float cn[4][2] = {{x,y},{x+w,y},{x+w,y+h},{x,y+h}};
    float mnx = 1e9f, mxx = -1e9f, mny = 1e9f, mxy = -1e9f;
    for (int i = 0; i < 4; i++) {
        float tx, ty;
        matrix_transform(mat, cn[i][0], cn[i][1], &tx, &ty);
        if (tx < mnx) mnx = tx; if (tx > mxx) mxx = tx;
        if (ty < mny) mny = ty; if (ty > mxy) mxy = ty;
    }
    int32_t ox = vm->draw_off_x, oy = vm->draw_off_y;
    int32_t ix0 = (int32_t)mnx, iy0 = (int32_t)mny;
    int32_t ix1 = (int32_t)(mxx + 1), iy1 = (int32_t)(mxy + 1);
    int32_t sy0 = vm->strip_y0 - oy;
    int32_t sy1 = sy0 + vm_strip_h(vm);
    if (ix0 < 0) ix0 = 0;
    if (iy0 < sy0) iy0 = sy0;
    if (ix1 > vm->canvas_w - ox) ix1 = vm->canvas_w - ox;
    if (iy1 > sy1) iy1 = sy1;
    for (int32_t py = iy0; py < iy1; py++)
        for (int32_t px = ix0; px < ix1; px++) {
            float lx = i0*((float)px - mat->m[4]) + i2*((float)py - mat->m[5]);
            float ly = i1*((float)px - mat->m[4]) + i3*((float)py - mat->m[5]);
            if (lx >= x && lx < x + w && ly >= y && ly < y + h)
                strip_set_pixel(vm, px, py, vm->current_color);
        }
}

static void draw_circle_stroke(vm_t *vm, int32_t cx, int32_t cy, int32_t r) {
    int32_t x = 0, y = r, d = 1 - r;
    while (x <= y) {
        strip_set_pixel(vm, cx + x, cy + y, vm->current_color);
        strip_set_pixel(vm, cx - x, cy + y, vm->current_color);
        strip_set_pixel(vm, cx + x, cy - y, vm->current_color);
        strip_set_pixel(vm, cx - x, cy - y, vm->current_color);
        strip_set_pixel(vm, cx + y, cy + x, vm->current_color);
        strip_set_pixel(vm, cx - y, cy + x, vm->current_color);
        strip_set_pixel(vm, cx + y, cy - x, vm->current_color);
        strip_set_pixel(vm, cx - y, cy - x, vm->current_color);
        if (d < 0) { d += 2 * x + 3; }
        else { d += 2 * (x - y) + 5; y--; }
        x++;
    }
}

static void draw_circle_fill(vm_t *vm, int32_t cx, int32_t cy, int32_t r) {
    int32_t x = 0, y = r, d = 1 - r;
    while (x <= y) {
        for (int32_t i = cx - x; i <= cx + x; i++) {
            strip_set_pixel(vm, i, cy + y, vm->current_color);
            strip_set_pixel(vm, i, cy - y, vm->current_color);
        }
        for (int32_t i = cx - y; i <= cx + y; i++) {
            strip_set_pixel(vm, i, cy + x, vm->current_color);
            strip_set_pixel(vm, i, cy - x, vm->current_color);
        }
        if (d < 0) { d += 2 * x + 3; }
        else { d += 2 * (x - y) + 5; y--; }
        x++;
    }
}

#ifdef VM_ENABLE_PATH
static void cubic_bezier_pt(float t, float x0, float y0, float cx1, float cy1,
                            float cx2, float cy2, float x1, float y1, float *ox, float *oy) {
    float u = 1 - t, uu = u*u, uuu = uu*u, tt = t*t, ttt = tt*t;
    *ox = uuu*x0 + 3*uu*t*cx1 + 3*u*tt*cx2 + ttt*x1;
    *oy = uuu*y0 + 3*uu*t*cy1 + 3*u*tt*cy2 + ttt*y1;
}

static void path_stroke(vm_t *vm, vm_color_t color, float width) {
    vm_matrix_t *mat = current_matrix(vm);
    vm_color_t saved = vm->current_color;
    bool saved_active = vm->draw_active;
    vm->current_color = color;
    if (is_binary_mode(vm))
        vm->draw_active = color_matches_render(vm, color);
    float px = 0, py = 0;
    for (int32_t i = 0; i < vm->path_count; i++) {
        vm_path_cmd_t *cmd = &vm->path_cmds[i];
        if (cmd->type == PATH_CMD_MOVE) {
            px = cmd->pts[0]; py = cmd->pts[1];
        } else if (cmd->type == PATH_CMD_LINE) {
            float tx0, ty0, tx1, ty1;
            matrix_transform(mat, px, py, &tx0, &ty0);
            matrix_transform(mat, cmd->pts[0], cmd->pts[1], &tx1, &ty1);
            draw_line_bresenham(vm, tx0, ty0, tx1, ty1, width);
            px = cmd->pts[0]; py = cmd->pts[1];
        } else if (cmd->type == PATH_CMD_CUBIC) {
            float ptx, pty;
            matrix_transform(mat, px, py, &ptx, &pty);
            for (int s = 1; s <= 20; s++) {
                float t = (float)s / 20.0f, bx, by;
                cubic_bezier_pt(t, px, py, cmd->pts[0], cmd->pts[1],
                               cmd->pts[2], cmd->pts[3], cmd->pts[4], cmd->pts[5], &bx, &by);
                float tx, ty;
                matrix_transform(mat, bx, by, &tx, &ty);
                draw_line_bresenham(vm, ptx, pty, tx, ty, width);
                ptx = tx; pty = ty;
            }
            px = cmd->pts[4]; py = cmd->pts[5];
        }
    }
    vm->current_color = saved;
    vm->draw_active = saved_active;
}

static float cross2d(float ax, float ay, float bx, float by) { return ax*by - ay*bx; }

typedef void (*path_edge_fn)(float x0, float y0, float x1, float y1, void *ctx);

static void path_iter_edges(vm_t *vm, const vm_matrix_t *mat, path_edge_fn fn, void *ctx) {
    float px = 0, py = 0, prev_tx = 0, prev_ty = 0;
    bool has_prev = false;
    for (int32_t i = 0; i < vm->path_count; i++) {
        vm_path_cmd_t *cmd = &vm->path_cmds[i];
        if (cmd->type == PATH_CMD_MOVE) {
            px = cmd->pts[0]; py = cmd->pts[1];
            matrix_transform(mat, px, py, &prev_tx, &prev_ty);
            has_prev = true;
        } else if (cmd->type == PATH_CMD_LINE) {
            if (has_prev) {
                float tx, ty;
                matrix_transform(mat, cmd->pts[0], cmd->pts[1], &tx, &ty);
                fn(prev_tx, prev_ty, tx, ty, ctx);
                prev_tx = tx; prev_ty = ty;
            }
            px = cmd->pts[0]; py = cmd->pts[1];
        } else if (cmd->type == PATH_CMD_CUBIC) {
            if (has_prev) {
                float ptx = prev_tx, pty = prev_ty;
                for (int s = 1; s <= 10; s++) {
                    float t = (float)s / 10.0f, bx, by, tx, ty;
                    cubic_bezier_pt(t, px, py, cmd->pts[0], cmd->pts[1],
                                   cmd->pts[2], cmd->pts[3], cmd->pts[4], cmd->pts[5], &bx, &by);
                    matrix_transform(mat, bx, by, &tx, &ty);
                    fn(ptx, pty, tx, ty, ctx);
                    ptx = tx; pty = ty;
                }
                prev_tx = ptx; prev_ty = pty;
            }
            px = cmd->pts[4]; py = cmd->pts[5];
        }
    }
}

typedef struct {
    float mnx, mny, mxx, mxy;
    int edge_count;
} path_bbox_t;

static void bbox_edge(float x0, float y0, float x1, float y1, void *ctx) {
    path_bbox_t *bb = (path_bbox_t *)ctx;
    if (bb->edge_count == 0) {
        bb->mnx = bb->mxx = x0; bb->mny = bb->mxy = y0;
    }
    if (x0 < bb->mnx) bb->mnx = x0; if (x0 > bb->mxx) bb->mxx = x0;
    if (y0 < bb->mny) bb->mny = y0; if (y0 > bb->mxy) bb->mxy = y0;
    if (x1 < bb->mnx) bb->mnx = x1; if (x1 > bb->mxx) bb->mxx = x1;
    if (y1 < bb->mny) bb->mny = y1; if (y1 > bb->mxy) bb->mxy = y1;
    bb->edge_count++;
}

typedef struct {
    float tx, ty;
    int winding;
} path_winding_t;

static void winding_edge(float x0, float y0, float x1, float y1, void *ctx) {
    path_winding_t *pw = (path_winding_t *)ctx;
    if (y0 <= pw->ty) {
        if (y1 > pw->ty && cross2d(x1 - x0, y1 - y0, pw->tx - x0, pw->ty - y0) > 0) pw->winding++;
    } else {
        if (y1 <= pw->ty && cross2d(x1 - x0, y1 - y0, pw->tx - x0, pw->ty - y0) < 0) pw->winding--;
    }
}

static void path_fill(vm_t *vm, vm_color_t color) {
    vm_matrix_t *mat = current_matrix(vm);
    vm_color_t saved = vm->current_color;
    bool saved_active = vm->draw_active;
    if (is_binary_mode(vm))
        vm->draw_active = color_matches_render(vm, color);

    path_bbox_t bb = {0, 0, 0, 0, 0};
    path_iter_edges(vm, mat, bbox_edge, &bb);
    if (bb.edge_count < 2) { vm->current_color = saved; return; }

    int32_t ix0 = (int32_t)bb.mnx, iy0 = (int32_t)bb.mny;
    int32_t ix1 = (int32_t)(bb.mxx + 1), iy1 = (int32_t)(bb.mxy + 1);
    if (ix0 < 0) ix0 = 0;
    if (iy0 < vm->strip_y0) iy0 = vm->strip_y0;
    if (ix1 > vm->canvas_w) ix1 = vm->canvas_w;
    if (iy1 > vm->strip_y0 + vm_strip_h(vm)) iy1 = vm->strip_y0 + vm_strip_h(vm);

    for (int32_t py2 = iy0; py2 < iy1; py2++)
        for (int32_t px2 = ix0; px2 < ix1; px2++) {
            path_winding_t pw = {(float)px2 + 0.5f, (float)py2 + 0.5f, 0};
            path_iter_edges(vm, mat, winding_edge, &pw);
            if (pw.winding != 0) strip_set_pixel(vm, px2, py2, color);
        }
    vm->current_color = saved;
    vm->draw_active = saved_active;
}
#endif

static void read_string(vm_t *vm, char *buf, int max_len) {
    int i = 0;
    while (vm->pc < vm->code_end && i < max_len - 1) {
        uint8_t ch = *vm->pc++;
        if (ch == 0) break;
        buf[i++] = (char)ch;
    }
    buf[i] = '\0';
}

static vm_color_t unpack_color(int32_t packed) {
    vm_color_t c;
    c.r = (uint8_t)((packed >> 16) & 0xFF);
    c.g = (uint8_t)((packed >> 8) & 0xFF);
    c.b = (uint8_t)(packed & 0xFF);
    return c;
}

static void exec_text(vm_t *vm) {
    float y = pop_f32(vm), x = pop_f32(vm);
    char text_buf[128];
    read_string(vm, text_buf, sizeof(text_buf));
    if (vm->error || !vm->font_res) return;
    vm_matrix_t *mat = current_matrix(vm);
    float cursor_x = x;
    for (int i = 0; text_buf[i]; i++) {
        uint32_t cp = (uint32_t)(uint8_t)text_buf[i];
        if (cp >= 0xC2 && cp <= 0xDF && text_buf[i+1]) {
            cp = ((cp & 0x1F) << 6) | ((uint8_t)text_buf[i+1] & 0x3F); i++;
        } else if (cp >= 0xE0 && cp <= 0xEF && text_buf[i+1] && text_buf[i+2]) {
            cp = ((cp & 0x0F) << 12) | (((uint8_t)text_buf[i+1] & 0x3F) << 6) |
                 ((uint8_t)text_buf[i+2] & 0x3F); i += 2;
        }
        const vm_glyph_entry_t *glyph = vm_font_find_glyph(vm->font_res, cp);
        if (!glyph) { cursor_x += 8.0f; continue; }
        float gx = cursor_x + (float)glyph->bearing_x;
        float gy = y - (float)glyph->bearing_y;
        uint16_t data_off = sizeof(vm_font_header_t) +
            ((const vm_font_header_t *)vm->font_res)->glyph_count * sizeof(vm_glyph_entry_t) +
            glyph->data_offset;
        const uint8_t *rle = vm->font_res + data_off;
        uint8_t row_pixels[256];
        for (int32_t gr = 0; gr < glyph->height; gr++) {
            float tx_base, ty;
            matrix_transform(mat, gx, gy + (float)gr, &tx_base, &ty);
            int32_t iy = (int32_t)(ty + 0.5f);
            if (iy < vm->strip_y0 || iy >= vm->strip_y0 + vm_strip_h(vm)) continue;
            vm_font_decode_rle_row(rle, glyph->data_length, glyph->width, glyph->height, gr, row_pixels);
            for (int32_t gc = 0; gc < glyph->width; gc++) {
                if (row_pixels[gc] == 0) continue;
                float tx2, ty2;
                matrix_transform(mat, gx + (float)gc, gy + (float)gr, &tx2, &ty2);
                strip_set_pixel(vm, (int32_t)(tx2 + 0.5f), (int32_t)(ty2 + 0.5f), vm->current_color);
            }
        }
        cursor_x += (float)glyph->advance_x;
    }
}

bool vm_step(vm_t *vm) {
    if (!vm->running || vm->pc >= vm->code_end) { vm->running = false; return false; }
    uint8_t op = read_u8(vm);
    if (vm->error) return false;

    switch ((vm_opcode_t)op) {
    case OP_NOP: break;

    case OP_PUSH_I32: { int32_t v = read_i32(vm); if (!vm->error) push(vm, v); break; }
    case OP_PUSH_F32: { float v = read_f32(vm); if (!vm->error) push_f32(vm, v); break; }

    case OP_ADD: { int32_t b = pop(vm), a = pop(vm); if (!vm->error) push(vm, a + b); break; }
    case OP_SUB: { int32_t b = pop(vm), a = pop(vm); if (!vm->error) push(vm, a - b); break; }
    case OP_MUL: { int32_t b = pop(vm), a = pop(vm); if (!vm->error) push(vm, a * b); break; }
    case OP_DIV: { int32_t b = pop(vm), a = pop(vm); if (!vm->error) { if (!b) { vm->error = vm->running = false; } else push(vm, a/b); } break; }
    case OP_MOD: { int32_t b = pop(vm), a = pop(vm); if (!vm->error) { if (!b) { vm->error = vm->running = false; } else push(vm, a%b); } break; }
    case OP_NEG: { int32_t a = pop(vm); if (!vm->error) push(vm, -a); break; }

    case OP_FADD: { float b = pop_f32(vm), a = pop_f32(vm); if (!vm->error) push_f32(vm, a+b); break; }
    case OP_FSUB: { float b = pop_f32(vm), a = pop_f32(vm); if (!vm->error) push_f32(vm, a-b); break; }
    case OP_FMUL: { float b = pop_f32(vm), a = pop_f32(vm); if (!vm->error) push_f32(vm, a*b); break; }
    case OP_FDIV: { float b = pop_f32(vm), a = pop_f32(vm); if (!vm->error) push_f32(vm, a/b); break; }
    case OP_FNEG: { float a = pop_f32(vm); if (!vm->error) push_f32(vm, -a); break; }

    case OP_I2F: { int32_t a = pop(vm); if (!vm->error) push_f32(vm, (float)a); break; }
    case OP_F2I: { float a = pop_f32(vm); if (!vm->error) push(vm, (int32_t)a); break; }

    case OP_DUP: { int32_t a = pop(vm); if (!vm->error) { push(vm, a); push(vm, a); } break; }
    case OP_DROP: pop(vm); break;
    case OP_SWAP: { int32_t b = pop(vm), a = pop(vm); if (!vm->error) { push(vm, b); push(vm, a); } break; }

    case OP_LOAD_LOCAL: { uint8_t i = read_u8(vm); if (!vm->error && i < VM_LOCAL_MAX) push(vm, vm->locals[i]); break; }
    case OP_STORE_LOCAL: { uint8_t i = read_u8(vm); int32_t v = pop(vm); if (!vm->error && i < VM_LOCAL_MAX) vm->locals[i] = v; break; }

    case OP_CMP_EQ: { int32_t b = pop(vm), a = pop(vm); if (!vm->error) push(vm, a == b); break; }
    case OP_CMP_NE: { int32_t b = pop(vm), a = pop(vm); if (!vm->error) push(vm, a != b); break; }
    case OP_CMP_LT: { int32_t b = pop(vm), a = pop(vm); if (!vm->error) push(vm, a < b); break; }
    case OP_CMP_GT: { int32_t b = pop(vm), a = pop(vm); if (!vm->error) push(vm, a > b); break; }
    case OP_CMP_LE: { int32_t b = pop(vm), a = pop(vm); if (!vm->error) push(vm, a <= b); break; }
    case OP_CMP_GE: { int32_t b = pop(vm), a = pop(vm); if (!vm->error) push(vm, a >= b); break; }
    case OP_FCMP_LT: { float b = pop_f32(vm), a = pop_f32(vm); if (!vm->error) push(vm, a < b); break; }
    case OP_FCMP_GT: { float b = pop_f32(vm), a = pop_f32(vm); if (!vm->error) push(vm, a > b); break; }
    case OP_FCMP_LE: { float b = pop_f32(vm), a = pop_f32(vm); if (!vm->error) push(vm, a <= b); break; }
    case OP_FCMP_GE: { float b = pop_f32(vm), a = pop_f32(vm); if (!vm->error) push(vm, a >= b); break; }

    case OP_AND: { int32_t b = pop(vm), a = pop(vm); if (!vm->error) push(vm, a && b); break; }
    case OP_OR:  { int32_t b = pop(vm), a = pop(vm); if (!vm->error) push(vm, a || b); break; }
    case OP_NOT: { int32_t a = pop(vm); if (!vm->error) push(vm, !a); break; }

    case OP_JMP: {
        int32_t off = read_i32(vm);
        if (!vm->error) {
            vm->pc = vm->code + off;
            if (vm->pc < vm->code || vm->pc > vm->code_end) { vm->error = true; vm->running = false; }
        }
        break;
    }
    case OP_JMP_IF: {
        int32_t off = read_i32(vm); int32_t c = pop(vm);
        if (!vm->error && c) {
            vm->pc = vm->code + off;
            if (vm->pc < vm->code || vm->pc > vm->code_end) { vm->error = true; vm->running = false; }
        }
        break;
    }
    case OP_JMP_IF_NOT: {
        int32_t off = read_i32(vm); int32_t c = pop(vm);
        if (!vm->error && !c) {
            vm->pc = vm->code + off;
            if (vm->pc < vm->code || vm->pc > vm->code_end) { vm->error = true; vm->running = false; }
        }
        break;
    }
    case OP_CALL: {
        int32_t off = read_i32(vm);
        if (!vm->error) {
            if (vm->call_sp >= VM_CALL_STACK) { vm->error = true; vm->running = false; }
            else {
                vm->call_stack[vm->call_sp++] = (uint32_t)(vm->pc - vm->code);
                vm->pc = vm->code + off;
                if (vm->pc < vm->code || vm->pc > vm->code_end)
                    { vm->error = true; vm->running = false; }
            }
        }
        break;
    }
    case OP_RET: {
        if (vm->call_sp <= 0) { vm->error = true; vm->running = false; }
        else vm->pc = vm->code + vm->call_stack[--vm->call_sp];
        break;
    }

    case OP_SET_COLOR: {
        int32_t b = pop(vm), g = pop(vm), r = pop(vm);
        if (!vm->error) {
            vm->current_color.r = (uint8_t)(r & 0xFF);
            vm->current_color.g = (uint8_t)(g & 0xFF);
            vm->current_color.b = (uint8_t)(b & 0xFF);
            if (is_binary_mode(vm))
                vm->draw_active = color_matches_render(vm, vm->current_color);
        }
        break;
    }
    case OP_RECT_FILL: {
        int32_t h = pop(vm), w = pop(vm), y = pop(vm), x = pop(vm);
        if (!vm->error) draw_rect_fill(vm, x, y, w, h);
        break;
    }
    case OP_LINE: {
        float y1 = pop_f32(vm), x1 = pop_f32(vm), y0 = pop_f32(vm), x0 = pop_f32(vm);
        if (!vm->error) {
            vm_matrix_t *mat = current_matrix(vm);
            float tx0, ty0, tx1, ty1;
            matrix_transform(mat, x0, y0, &tx0, &ty0);
            matrix_transform(mat, x1, y1, &tx1, &ty1);
            draw_line_bresenham(vm, tx0, ty0, tx1, ty1, vm->line_width);
        }
        break;
    }
    case OP_RECT: {
        float r = pop_f32(vm), h = pop_f32(vm), w = pop_f32(vm), y = pop_f32(vm), x = pop_f32(vm);
        if (!vm->error) draw_rect_transformed(vm, x, y, w, h, r);
        break;
    }

    case OP_PUSH_MATRIX: {
        if (vm->matrix_sp >= VM_MATRIX_STACK - 1) { vm->error = true; vm->running = false; }
        else { vm->matrix_stack[vm->matrix_sp + 1] = vm->matrix_stack[vm->matrix_sp]; vm->matrix_sp++; }
        break;
    }
    case OP_POP_MATRIX: {
        if (vm->matrix_sp <= 0) { vm->error = true; vm->running = false; }
        else vm->matrix_sp--;
        break;
    }
    case OP_TRANSLATE: {
        float y = pop_f32(vm), x = pop_f32(vm);
        if (!vm->error) {
            vm_matrix_t t; matrix_identity(&t); t.m[4] = x; t.m[5] = y;
            vm_matrix_t res; matrix_multiply(&res, current_matrix(vm), &t);
            *current_matrix(vm) = res;
        }
        break;
    }
    case OP_ROTATE: {
        float deg = pop_f32(vm);
        if (!vm->error) {
            float rad = deg * 3.14159265358979f / 180.0f;
            float c = cosf(rad), s = sinf(rad);
            vm_matrix_t r; matrix_identity(&r);
            r.m[0] = c; r.m[1] = s; r.m[2] = -s; r.m[3] = c;
            vm_matrix_t res; matrix_multiply(&res, current_matrix(vm), &r);
            *current_matrix(vm) = res;
        }
        break;
    }
    case OP_SCALE: {
        float sy = pop_f32(vm), sx = pop_f32(vm);
        if (!vm->error) {
            vm_matrix_t sc; matrix_identity(&sc); sc.m[0] = sx; sc.m[3] = sy;
            vm_matrix_t res; matrix_multiply(&res, current_matrix(vm), &sc);
            *current_matrix(vm) = res;
        }
        break;
    }
    case OP_CIRCLE: {
        float r = pop_f32(vm), cy = pop_f32(vm), cx = pop_f32(vm);
        if (!vm->error) {
            vm_matrix_t *mat = current_matrix(vm);
            float tx, ty;
            matrix_transform(mat, cx, cy, &tx, &ty);
            draw_circle_stroke(vm, (int32_t)(tx + 0.5f), (int32_t)(ty + 0.5f), (int32_t)(r + 0.5f));
        }
        break;
    }
    case OP_CIRCLE_FILL: {
        float r = pop_f32(vm), cy = pop_f32(vm), cx = pop_f32(vm);
        if (!vm->error) {
            vm_matrix_t *mat = current_matrix(vm);
            float tx, ty;
            matrix_transform(mat, cx, cy, &tx, &ty);
            draw_circle_fill(vm, (int32_t)(tx + 0.5f), (int32_t)(ty + 0.5f), (int32_t)(r + 0.5f));
        }
        break;
    }

#ifdef VM_ENABLE_PATH
    case OP_PATH_BEGIN:
        vm->path_count = 0;
        vm->path_start_x = 0; vm->path_start_y = 0;
        break;
    case OP_PATH_MOVE: {
        float y = pop_f32(vm), x = pop_f32(vm);
        if (!vm->error && vm->path_count < VM_PATH_MAX_PTS) {
            vm->path_cmds[vm->path_count].type = PATH_CMD_MOVE;
            vm->path_cmds[vm->path_count].pts[0] = x;
            vm->path_cmds[vm->path_count].pts[1] = y;
            vm->path_count++;
            vm->path_start_x = x; vm->path_start_y = y;
        }
        break;
    }
    case OP_PATH_LINE: {
        float y = pop_f32(vm), x = pop_f32(vm);
        if (!vm->error && vm->path_count < VM_PATH_MAX_PTS) {
            vm->path_cmds[vm->path_count].type = PATH_CMD_LINE;
            vm->path_cmds[vm->path_count].pts[0] = x;
            vm->path_cmds[vm->path_count].pts[1] = y;
            vm->path_count++;
        }
        break;
    }
    case OP_PATH_CUBIC: {
        float y = pop_f32(vm), x = pop_f32(vm);
        float cy2 = pop_f32(vm), cx2 = pop_f32(vm);
        float cy1 = pop_f32(vm), cx1 = pop_f32(vm);
        if (!vm->error && vm->path_count < VM_PATH_MAX_PTS) {
            vm->path_cmds[vm->path_count].type = PATH_CMD_CUBIC;
            vm->path_cmds[vm->path_count].pts[0] = cx1;
            vm->path_cmds[vm->path_count].pts[1] = cy1;
            vm->path_cmds[vm->path_count].pts[2] = cx2;
            vm->path_cmds[vm->path_count].pts[3] = cy2;
            vm->path_cmds[vm->path_count].pts[4] = x;
            vm->path_cmds[vm->path_count].pts[5] = y;
            vm->path_count++;
        }
        break;
    }
    case OP_PATH_CLOSE: {
        if (vm->path_count < VM_PATH_MAX_PTS) {
            vm->path_cmds[vm->path_count].type = PATH_CMD_LINE;
            vm->path_cmds[vm->path_count].pts[0] = vm->path_start_x;
            vm->path_cmds[vm->path_count].pts[1] = vm->path_start_y;
            vm->path_count++;
        }
        break;
    }
    case OP_PATH_FILL: {
        int32_t color_val = pop(vm);
        if (!vm->error) path_fill(vm, unpack_color(color_val));
        break;
    }
    case OP_PATH_STROKE: {
        float width = pop_f32(vm);
        int32_t color_val = pop(vm);
        if (!vm->error) path_stroke(vm, unpack_color(color_val), width);
        break;
    }
#endif

    case OP_TEXT: exec_text(vm); break;

    case OP_CALL_FFI: {
        uint8_t id = read_u8(vm);
        uint8_t argc = read_u8(vm);
        if (vm->error) break;
        if (id >= vm->ffi_count || !vm->ffi_table || !vm->ffi_table[id]) {
            vm->error = true; vm->running = false; break;
        }
        int32_t args[16];
        uint8_t n = argc > 16 ? 16 : argc;
        for (uint8_t i = 0; i < n; i++) {
            args[n - 1 - i] = pop(vm);
            if (vm->error) break;
        }
        if (!vm->error) vm->ffi_table[id](vm, args, argc);
        break;
    }

    case OP_END:
        vm->running = false;
        break;

    default:
        vm->error = true;
        vm->running = false;
        break;
    }

    return vm->running;
}



void vm_run(vm_t *vm, uint32_t pc_offset,
            void (*strip_cb)(int32_t y0, int32_t y1, void *user),
            void *user) {
    const uint8_t *start_pc = vm->code + pc_offset;
    if (start_pc > vm->code_end) start_pc = vm->code_end;

    if (is_binary_mode(vm))
        vm->draw_active = color_matches_render(vm, vm->current_color);
    else
        vm->draw_active = true;

    int32_t saved_locals[VM_LOCAL_MAX];
    memcpy(saved_locals, vm->locals, sizeof(saved_locals));

    int32_t strip_h = vm_strip_h(vm);
    for (int32_t y = 0; y < vm->canvas_h; y += strip_h) {
        vm->strip_y0 = y;
        int32_t y1 = y + strip_h;
        if (y1 > vm->canvas_h) y1 = vm->canvas_h;

        if (is_binary_mode(vm)) {
            memset(vm->strip_buf, 0, (size_t)vm->strip_length);
        } else {
            uint8_t *buf = vm->strip_buf;
            size_t count = (size_t)vm->strip_length;
            for (size_t i = 0; i < count; i++) {
                buf[i * 3]     = vm->strip_bg.r;
                buf[i * 3 + 1] = vm->strip_bg.g;
                buf[i * 3 + 2] = vm->strip_bg.b;
            }
        }

        vm->pc = start_pc;
        vm->sp = 0;
        vm->call_sp = 0;
        vm->running = true;
        vm->error = false;
        vm->matrix_sp = 0;
        vm->draw_off_x = 0;
        vm->draw_off_y = 0;
        vm->line_width = 1.0f;
#ifdef VM_ENABLE_PATH
        vm->path_count = 0;
#endif
        memcpy(vm->locals, saved_locals, sizeof(saved_locals));
        matrix_identity(&vm->matrix_stack[0]);
        while (vm->running) vm_step(vm);

        if (strip_cb) strip_cb(y, y1, user);
    }
}
