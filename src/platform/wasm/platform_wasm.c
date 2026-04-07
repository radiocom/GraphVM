#include "platform/platform.h"
#include <stdio.h>
#include <stdarg.h>

uint32_t platform_get_time_ms(void) {
    return 0;
}

void platform_delay_ms(uint32_t ms) {
    (void)ms;
}

void platform_log(const char *fmt, ...) {
    va_list args;
    va_start(args, fmt);
    vprintf(fmt, args);
    va_end(args);
}
