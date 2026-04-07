#ifndef GRAPH_VM_COMPILER_H
#define GRAPH_VM_COMPILER_H

#include <stdint.h>
#include <stdbool.h>

#ifdef __cplusplus
extern "C" {
#endif

int vm_compile(const char *dsl_text, uint8_t **out_buf, uint32_t *out_len);
int32_t vm_parse_color(const char *s);

#ifdef __cplusplus
}
#endif

#endif
