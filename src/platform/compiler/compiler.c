#include "vm/compiler.h"
#include "vm/vm.h"
#include <stdlib.h>
#include <string.h>
#include <ctype.h>

#define BUF_INIT_CAP 256
#define MAX_ARGS 16
#define MAX_LINE_LEN 512

typedef struct {
    uint8_t *data;
    uint32_t len;
    uint32_t cap;
} bytebuf_t;

static void buf_init(bytebuf_t *b) {
    b->data = (uint8_t *)malloc(BUF_INIT_CAP);
    b->len  = 0;
    b->cap  = BUF_INIT_CAP;
}

static void buf_ensure(bytebuf_t *b, uint32_t extra) {
    if (b->len + extra <= b->cap) return;
    while (b->len + extra > b->cap) b->cap *= 2;
    b->data = (uint8_t *)realloc(b->data, b->cap);
}

static void buf_push(bytebuf_t *b, uint8_t byte) {
    buf_ensure(b, 1);
    b->data[b->len++] = byte;
}

static void buf_write_i32_le(bytebuf_t *b, int32_t val) {
    buf_ensure(b, 4);
    uint32_t v = (uint32_t)val;
    b->data[b->len++] = (uint8_t)(v & 0xFF);
    b->data[b->len++] = (uint8_t)((v >> 8) & 0xFF);
    b->data[b->len++] = (uint8_t)((v >> 16) & 0xFF);
    b->data[b->len++] = (uint8_t)((v >> 24) & 0xFF);
}

static void buf_write_f32_le(bytebuf_t *b, float val) {
    int32_t bits;
    memcpy(&bits, &val, sizeof(bits));
    buf_write_i32_le(b, bits);
}

static void emit_push_imm(bytebuf_t *b, int32_t val) {
    buf_push(b, OP_PUSH_IMM);
    buf_write_i32_le(b, val);
}

static void emit_push_f32(bytebuf_t *b, float val) {
    buf_push(b, OP_PUSH_F32);
    buf_write_f32_le(b, val);
}

static void emit_string(bytebuf_t *b, const char *str) {
    while (*str) buf_push(b, (uint8_t)*str++);
    buf_push(b, 0);
}

static int hex_digit(char c) {
    if (c >= '0' && c <= '9') return c - '0';
    if (c >= 'a' && c <= 'f') return 10 + (c - 'a');
    if (c >= 'A' && c <= 'F') return 10 + (c - 'A');
    return -1;
}

typedef struct { const char *name; int32_t value; } named_color_t;

static const named_color_t named_colors[] = {
    { "black",   0x000000 }, { "white",   0xFFFFFF },
    { "red",     0xFF0000 }, { "green",   0x00FF00 },
    { "blue",    0x0000FF }, { "yellow",  0xFFFF00 },
    { "cyan",    0x00FFFF }, { "magenta", 0xFF00FF },
    { "gray",    0x808080 }, { "grey",    0x808080 },
    { "orange",  0xFFA500 }, { "purple",  0x800080 },
    { "pink",    0xFFC0CB }, { "brown",   0xA52A2A },
    { "none",    -1       }, { NULL,      0        }
};

static int str_icmp(const char *a, const char *b) {
    while (*a && *b) {
        char ca = (char)tolower((unsigned char)*a);
        char cb = (char)tolower((unsigned char)*b);
        if (ca != cb) return ca - cb;
        a++; b++;
    }
    return (unsigned char)*a - (unsigned char)*b;
}

int32_t vm_parse_color(const char *s) {
    if (!s || !*s) return 0x000000;

    if (s[0] == '#') {
        const char *hex = s + 1;
        size_t hlen = strlen(hex);
        if (hlen == 6) {
            int32_t val = 0;
            for (int i = 0; i < 6; i++) {
                int d = hex_digit(hex[i]);
                if (d < 0) return 0x000000;
                val = (val << 4) | d;
            }
            return val;
        }
        if (hlen == 3) {
            int r = hex_digit(hex[0]);
            int g = hex_digit(hex[1]);
            int b = hex_digit(hex[2]);
            if (r < 0 || g < 0 || b < 0) return 0x000000;
            return ((r << 4 | r) << 16) | ((g << 4 | g) << 8) | (b << 4 | b);
        }
    }

    for (const named_color_t *nc = named_colors; nc->name; nc++) {
        if (str_icmp(s, nc->name) == 0) return nc->value;
    }
    return 0x000000;
}

typedef struct {
    char op[32];
    char args[MAX_ARGS][64];
    int  argc;
} dsl_line_t;

static void str_upper(char *dst, const char *src, size_t n) {
    size_t i = 0;
    while (src[i] && i < n - 1) { dst[i] = (char)toupper((unsigned char)src[i]); i++; }
    dst[i] = '\0';
}

static int parse_dsl_line(const char *raw, dsl_line_t *out) {
    char line[MAX_LINE_LEN];
    size_t len = strlen(raw);
    if (len >= MAX_LINE_LEN) len = MAX_LINE_LEN - 1;
    memcpy(line, raw, len);
    line[len] = '\0';

    char *semi = strchr(line, ';');
    if (semi) *semi = '\0';

    char *p = line;
    while (*p && isspace((unsigned char)*p)) p++;
    char *end = p + strlen(p);
    while (end > p && isspace((unsigned char)*(end - 1))) end--;
    *end = '\0';

    if (*p == '\0') return 0;

    out->argc = 0;
    char *tok = p;
    while (*tok && !isspace((unsigned char)*tok)) tok++;
    size_t op_len = (size_t)(tok - p);
    if (op_len >= sizeof(out->op)) op_len = sizeof(out->op) - 1;
    str_upper(out->op, p, op_len + 1);
    out->op[op_len] = '\0';

    while (*tok && out->argc < MAX_ARGS) {
        while (*tok && isspace((unsigned char)*tok)) tok++;
        if (!*tok) break;

        char *arg_start = tok;
        if (*tok == '"') {
            tok++;
            while (*tok && *tok != '"') tok++;
            if (*tok == '"') tok++;
        } else {
            while (*tok && !isspace((unsigned char)*tok)) tok++;
        }
        size_t alen = (size_t)(tok - arg_start);
        if (alen >= 64) alen = 63;
        memcpy(out->args[out->argc], arg_start, alen);
        out->args[out->argc][alen] = '\0';
        out->argc++;
    }
    return 1;
}

static bool is_float_str(const char *s) {
    while (*s) { if (*s == '.' || *s == 'e' || *s == 'E') return true; s++; }
    return false;
}

static float parse_float(const char *s) { return (float)atof(s); }
static int32_t parse_int(const char *s) { return (int32_t)atof(s); }
static bool is_identifier(const char *s) { return s && *s && (isalpha((unsigned char)*s) || *s == '_'); }

typedef struct { const char *name; uint8_t opcode; } opcode_entry_t;

static const opcode_entry_t opcode_table[] = {
    { "NOP",                   OP_NOP },
    { "PUSH_IMM",             OP_PUSH_IMM },
    { "PUSH",                 OP_PUSH_IMM },
    { "PUSH_F32",             OP_PUSH_F32 },
    { "ADD",                  OP_ADD },
    { "SUB",                  OP_SUB },
    { "MUL",                  OP_MUL },
    { "DIV",                  OP_DIV },
    { "DUP",                  OP_DUP },
    { "DROP",                 OP_DROP },
    { "SWAP",                 OP_SWAP },
    { "SET_COLOR",            OP_SET_COLOR },
    { "RECT_FILL",            OP_RECT_FILL },
    { "LINE",                 OP_LINE },
    { "RECT",                 OP_RECT },
    { "PUSH_MATRIX",          OP_PUSH_MATRIX },
    { "POP_MATRIX",           OP_POP_MATRIX },
    { "TRANSLATE",            OP_TRANSLATE },
    { "ROTATE",               OP_ROTATE },
    { "SCALE",                OP_SCALE },
    { "PATH_BEGIN",           OP_PATH_BEGIN },
    { "PATH_MOVE",            OP_PATH_MOVE },
    { "PATH_LINE",            OP_PATH_LINE },
    { "PATH_CUBIC",           OP_PATH_CUBIC },
    { "PATH_END_STROKE",      OP_PATH_END_STROKE },
    { "PATH_END_FILL",        OP_PATH_END_FILL },
    { "TEXT",                 OP_TEXT },
    { "CALL_FFI",             OP_CALL_FFI },
    { "SET_PARAM",            OP_SET_PARAM },
    { "GET_PARAM",            OP_GET_PARAM },
    { "TIMER_START",          OP_TIMER_START },
    { "TIMER_STOP",           OP_TIMER_STOP },
    { "SET_REFRESH_INTERVAL", OP_SET_REFRESH_INTERVAL },
    { "REQUEST_REFRESH",      OP_REQUEST_REFRESH },
    { "JMP",                  OP_JMP },
    { "JMP_IF",               OP_JMP_IF },
    { "END",                  OP_END },
    { NULL,                   0 }
};

static int lookup_opcode(const char *name, uint8_t *out) {
    for (const opcode_entry_t *e = opcode_table; e->name; e++) {
        if (strcmp(name, e->name) == 0) { *out = e->opcode; return 1; }
    }
    return 0;
}

static bool has_set_param(const dsl_line_t *lines, int count, const char *name) {
    for (int i = 0; i < count; i++) {
        if (strcmp(lines[i].op, "SET_PARAM") == 0 &&
            lines[i].argc > 0 &&
            strcmp(lines[i].args[0], name) == 0)
            return true;
    }
    return false;
}

int vm_compile(const char *dsl_text, uint8_t **out_buf, uint32_t *out_len) {
    if (!dsl_text || !out_buf || !out_len) return -1;
    *out_buf = NULL;
    *out_len = 0;

    int max_lines = 256;
    dsl_line_t *lines = (dsl_line_t *)malloc((size_t)max_lines * sizeof(dsl_line_t));
    int line_count = 0;

    const char *cursor = dsl_text;
    while (*cursor) {
        const char *eol = cursor;
        while (*eol && *eol != '\n') eol++;

        size_t llen = (size_t)(eol - cursor);
        char line_buf[MAX_LINE_LEN];
        if (llen >= MAX_LINE_LEN) llen = MAX_LINE_LEN - 1;
        memcpy(line_buf, cursor, llen);
        line_buf[llen] = '\0';

        if (line_count >= max_lines) {
            max_lines *= 2;
            lines = (dsl_line_t *)realloc(lines, (size_t)max_lines * sizeof(dsl_line_t));
        }
        if (parse_dsl_line(line_buf, &lines[line_count]))
            line_count++;

        cursor = *eol ? eol + 1 : eol;
    }

    bytebuf_t buf;
    buf_init(&buf);

    for (int i = 0; i < line_count; i++) {
        const dsl_line_t *ln = &lines[i];
        const char *op = ln->op;
        int argc = ln->argc;

        if (strcmp(op, "SET_COLOR") == 0) {
            if (argc >= 3) {
                emit_push_imm(&buf, parse_int(ln->args[0]));
                emit_push_imm(&buf, parse_int(ln->args[1]));
                emit_push_imm(&buf, parse_int(ln->args[2]));
                buf_push(&buf, OP_SET_COLOR);
            }
        } else if (strcmp(op, "RECT_FILL") == 0) {
            if (argc >= 4) {
                emit_push_imm(&buf, parse_int(ln->args[0]));
                emit_push_imm(&buf, parse_int(ln->args[1]));
                emit_push_imm(&buf, parse_int(ln->args[2]));
                emit_push_imm(&buf, parse_int(ln->args[3]));
                buf_push(&buf, OP_RECT_FILL);
            }
        } else if (strcmp(op, "LINE") == 0) {
            if (argc >= 4) {
                emit_push_f32(&buf, parse_float(ln->args[0]));
                emit_push_f32(&buf, parse_float(ln->args[1]));
                emit_push_f32(&buf, parse_float(ln->args[2]));
                emit_push_f32(&buf, parse_float(ln->args[3]));
                buf_push(&buf, OP_LINE);
            }
        } else if (strcmp(op, "RECT") == 0) {
            if (argc >= 4) {
                emit_push_f32(&buf, parse_float(ln->args[0]));
                emit_push_f32(&buf, parse_float(ln->args[1]));
                emit_push_f32(&buf, parse_float(ln->args[2]));
                emit_push_f32(&buf, parse_float(ln->args[3]));
                emit_push_f32(&buf, argc >= 5 ? parse_float(ln->args[4]) : 0.0f);
                buf_push(&buf, OP_RECT);
            }
        } else if (strcmp(op, "PUSH_MATRIX") == 0) {
            buf_push(&buf, OP_PUSH_MATRIX);
        } else if (strcmp(op, "POP_MATRIX") == 0) {
            buf_push(&buf, OP_POP_MATRIX);
        } else if (strcmp(op, "TRANSLATE") == 0) {
            if (argc >= 2) {
                emit_push_f32(&buf, parse_float(ln->args[0]));
                emit_push_f32(&buf, parse_float(ln->args[1]));
                buf_push(&buf, OP_TRANSLATE);
            }
        } else if (strcmp(op, "ROTATE") == 0) {
            if (argc >= 1) {
                const char *val = ln->args[0];
                if (has_set_param(lines, line_count, val) || is_identifier(val)) {
                    buf_push(&buf, OP_GET_PARAM);
                    emit_string(&buf, val);
                } else {
                    emit_push_f32(&buf, parse_float(val));
                }
                buf_push(&buf, OP_ROTATE);
            }
        } else if (strcmp(op, "SCALE") == 0) {
            if (argc >= 2) {
                emit_push_f32(&buf, parse_float(ln->args[0]));
                emit_push_f32(&buf, parse_float(ln->args[1]));
                buf_push(&buf, OP_SCALE);
            }
        } else if (strcmp(op, "PATH_BEGIN") == 0) {
            buf_push(&buf, OP_PATH_BEGIN);
        } else if (strcmp(op, "PATH_MOVE") == 0) {
            if (argc >= 2) {
                emit_push_f32(&buf, parse_float(ln->args[0]));
                emit_push_f32(&buf, parse_float(ln->args[1]));
                buf_push(&buf, OP_PATH_MOVE);
            }
        } else if (strcmp(op, "PATH_LINE") == 0) {
            if (argc >= 2) {
                emit_push_f32(&buf, parse_float(ln->args[0]));
                emit_push_f32(&buf, parse_float(ln->args[1]));
                buf_push(&buf, OP_PATH_LINE);
            }
        } else if (strcmp(op, "PATH_CUBIC") == 0) {
            if (argc >= 6) {
                for (int a = 0; a < 6; a++)
                    emit_push_f32(&buf, parse_float(ln->args[a]));
                buf_push(&buf, OP_PATH_CUBIC);
            }
        } else if (strcmp(op, "PATH_END_STROKE") == 0) {
            if (argc >= 2) {
                emit_push_imm(&buf, vm_parse_color(ln->args[0]));
                emit_push_f32(&buf, parse_float(ln->args[1]));
                buf_push(&buf, OP_PATH_END_STROKE);
            }
        } else if (strcmp(op, "PATH_END_FILL") == 0) {
            if (argc >= 1) {
                emit_push_imm(&buf, vm_parse_color(ln->args[0]));
                buf_push(&buf, OP_PATH_END_FILL);
            }
        } else if (strcmp(op, "TEXT") == 0) {
            if (argc >= 3) {
                emit_push_f32(&buf, parse_float(ln->args[0]));
                emit_push_f32(&buf, parse_float(ln->args[1]));
                buf_push(&buf, OP_TEXT);

                char text_content[256] = {0};
                for (int a = 2; a < argc; a++) {
                    if (a > 2) strcat(text_content, " ");
                    size_t cur_len = strlen(text_content);
                    size_t arg_len = strlen(ln->args[a]);
                    if (cur_len + arg_len + 1 < sizeof(text_content))
                        strcat(text_content, ln->args[a]);
                }
                char *tc = text_content;
                size_t tc_len = strlen(tc);
                if (tc_len > 0 && tc[0] == '"') { memmove(tc, tc + 1, tc_len); tc_len--; }
                if (tc_len > 0 && tc[tc_len - 1] == '"') tc[tc_len - 1] = '\0';
                emit_string(&buf, tc);
            }
        } else if (strcmp(op, "SET_PARAM") == 0) {
            if (argc >= 2) {
                emit_push_f32(&buf, parse_float(ln->args[1]));
                buf_push(&buf, OP_SET_PARAM);
                emit_string(&buf, ln->args[0]);
            }
        } else if (strcmp(op, "CALL_FFI") == 0) {
            if (argc >= 2) {
                int32_t ffi_id = parse_int(ln->args[0]);
                int32_t ffi_argc = parse_int(ln->args[1]);
                for (int a = 2; a < argc; a++)
                    emit_push_imm(&buf, parse_int(ln->args[a]));
                buf_push(&buf, OP_CALL_FFI);
                buf_push(&buf, (uint8_t)(ffi_id & 0xFF));
                buf_push(&buf, (uint8_t)(ffi_argc & 0xFF));
            }
        } else if (strcmp(op, "PUSH_IMM") == 0 || strcmp(op, "PUSH") == 0) {
            if (argc >= 1) {
                if (is_float_str(ln->args[0]))
                    emit_push_f32(&buf, parse_float(ln->args[0]));
                else
                    emit_push_imm(&buf, parse_int(ln->args[0]));
            }
        } else if (strcmp(op, "PUSH_F32") == 0) {
            if (argc >= 1) emit_push_f32(&buf, parse_float(ln->args[0]));
        } else if (strcmp(op, "END") == 0) {
            buf_push(&buf, OP_END);
        } else {
            uint8_t opcode;
            if (lookup_opcode(op, &opcode)) {
                for (int a = 0; a < argc; a++) {
                    if (is_float_str(ln->args[a]))
                        emit_push_f32(&buf, parse_float(ln->args[a]));
                    else
                        emit_push_imm(&buf, parse_int(ln->args[a]));
                }
                buf_push(&buf, opcode);
            }
        }
    }

    if (buf.len == 0 || buf.data[buf.len - 1] != OP_END)
        buf_push(&buf, OP_END);

    free(lines);
    *out_buf = buf.data;
    *out_len = buf.len;
    return 0;
}
